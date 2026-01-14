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
    return this.prisma.state.update({
      where: { code },
      data,
    });
  }

  async remove(code: string): Promise<State> {
    return this.prisma.state.delete({ where: { code } });
  }
}
