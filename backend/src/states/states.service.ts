import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { State, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class StatesService {
  constructor(private prisma: PrismaService) {}

  async create(data: any): Promise<State> {
    const { username, password, ...stateData } = data;

    // If username/password provided, create user transactionally
    if (username && password) {
        // Check if user exists
        const existingUser = await this.prisma.user.findUnique({ where: { phone: username } });
        if (existingUser) {
            throw new BadRequestException('User with this phone number already exists');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        try {
            return await this.prisma.$transaction(async (tx) => {
                const state = await tx.state.create({ data: stateData });
                
                await tx.user.create({
                    data: {
                        name: `${stateData.name} Admin`,
                        phone: username,
                        password: hashedPassword,
                        role: UserRole.STATE_ADMIN,
                        stateCode: state.code,
                        status: 'ACTIVE'
                    }
                });

                return state;
            });
        } catch (e: any) {
            if (e.code === 'P2002') {
                throw new BadRequestException('State code already exists');
            }
            throw e;
        }
    }

    try {
        return await this.prisma.state.create({ data: stateData });
    } catch (e: any) {
        if (e.code === 'P2002') {
            throw new BadRequestException('State code already exists');
        }
        throw e;
    }
  }

  async findAll() {
    const states = await this.prisma.state.findMany({
      include: {
        _count: {
          select: { rtos: true }
        }
      }
    });

    // Also fetch all OEMs to map authorized brands
    const allOems = await this.prisma.oEM.findMany({
      select: { code: true, name: true, authorizedStates: true }
    });

    return states.map(state => {
      const authorizedBrands = allOems
        .filter(oem => oem.authorizedStates.includes(state.code))
        .map(oem => oem.name);

      return {
        ...state,
        rtosCount: state._count.rtos,
        authorizedBrands
      };
    });
  }

  async findOne(code: string): Promise<State | null> {
    return this.prisma.state.findUnique({ where: { code } });
  }

  async update(code: string, data: any): Promise<State> {
    const {
      username,
      password,
      authorizedBrands,
      rtosCount,
      _count,
      createdAt,
      updatedAt,
      ...rest
    } = data || {};

    const stateUpdateData: Partial<State> = {};
    if (typeof rest?.name === 'string') stateUpdateData.name = rest.name;
    if (typeof rest?.showOnHomepage === 'boolean') stateUpdateData.showOnHomepage = rest.showOnHomepage;

    const nextPassword = typeof password === 'string' ? password.trim() : '';
    const shouldUpdatePassword = Boolean(username) && Boolean(nextPassword);

    try {
      if (!Object.keys(stateUpdateData).length && !shouldUpdatePassword) {
        const state = await this.prisma.state.findUnique({ where: { code } });
        if (!state) throw new BadRequestException('State not found');
        return state;
      }

      return await this.prisma.$transaction(async (tx) => {
        const updatedState = Object.keys(stateUpdateData).length
          ? await tx.state.update({ where: { code }, data: stateUpdateData })
          : await tx.state.findUniqueOrThrow({ where: { code } });

        if (shouldUpdatePassword) {
          const hashedPassword = await bcrypt.hash(nextPassword, 10);
          const existing = await tx.user.findFirst({
            where: { phone: String(username), role: UserRole.STATE_ADMIN, stateCode: code },
          });
          if (existing) {
            await tx.user.update({ where: { id: existing.id }, data: { password: hashedPassword } });
          } else {
            await tx.user.create({
              data: {
                name: `${updatedState.name} Admin`,
                phone: String(username),
                password: hashedPassword,
                role: UserRole.STATE_ADMIN,
                stateCode: code,
                status: 'ACTIVE',
              },
            });
          }
        }

        return updatedState;
      });
    } catch (e: any) {
      if (e?.code === 'P2025') {
        throw new BadRequestException('State not found');
      }
      throw e;
    }
  }

  async remove(code: string): Promise<State> {
    return this.prisma.state.delete({ where: { code } });
  }
}
