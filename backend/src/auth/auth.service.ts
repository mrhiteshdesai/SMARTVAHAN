import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma.service";
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async validateUser(phone: string, pass: string): Promise<any> {
    try {
        // Check System Users
        const user = await this.prisma.user.findUnique({
          where: { phone },
          include: {
            authorizedSldOems: { select: { id: true, code: true, name: true } },
          },
        });
        if (user) {
            const isValid = await bcrypt.compare(pass, user.password);
            if (isValid && user.status === 'ACTIVE') {
                const { password, authorizedSldOems, ...result } = user;
                const isFullAdmin =
                  result.role === 'SUPER_ADMIN' || result.role === 'ADMIN';
                if (result.role === 'SLD_ADMIN') {
                  return {
                    ...result,
                    hasSldAccess: authorizedSldOems.length > 0,
                    hasReflectiveAccess: false,
                    sldOems: authorizedSldOems,
                  };
                }
                return {
                  ...result,
                  hasSldAccess: isFullAdmin ? true : undefined,
                  hasReflectiveAccess: isFullAdmin ? true : undefined,
                  oems: isFullAdmin ? 'All Reflective OEMs' : undefined,
                  sldOems: isFullAdmin
                    ? [{ code: 'ALL', name: 'All SLD OEMs' }]
                    : undefined,
                };
            }
        }

        // Check Dealers
        const dealer = await this.prisma.dealer.findUnique({
          where: { phone },
          include: { oems: true, sldOems: true, state: true }
        });
        if (dealer) {
            // Ensure password exists before comparing
            if (!dealer.password) return null;
            
            const isValid = await bcrypt.compare(pass, dealer.password);
            if (isValid && dealer.status === 'ACTIVE') {
                return {
                    id: dealer.id,
                    name: dealer.name,
                    phone: dealer.phone,
                    role: 'DEALER_USER',
                    status: dealer.status,
                    stateCode: dealer.stateCode,
                    stateName: dealer.state?.name,
                    oems: dealer.oems.map(o => o.name).join(', '),
                    sldOems: dealer.sldOems.map((o) => ({
                      id: o.id,
                      code: o.code,
                      name: o.name,
                    })),
                    hasSldAccess: dealer.sldOems.length > 0,
                    hasReflectiveAccess: dealer.oems.length > 0,
                    passingRtosAll: dealer.passingRtosAll,
                    passingRtoCodes: dealer.passingRtoCodes,
                    dealerUpdatedAt: dealer.updatedAt.toISOString(),
                };
            }
        }
    } catch (error) {
        console.error("Auth Validation Error:", error);
        return null;
    }

    return null;
  }

  async login(user: any, ipAddress?: string) {
    const payload = { 
        sub: user.id, 
        role: user.role, 
        phone: user.phone,
        stateCode: user.stateCode,
        oemCode: user.oemCode
    };
    return {
      ok: true,
      user: user,
      accessToken: await this.jwt.signAsync(payload),
    };
  }

  async getProfile(userId: string, role: string) {
    if (role === 'DEALER_USER' || role === 'DEALER') {
      const dealer = await this.prisma.dealer.findUnique({
        where: { id: userId },
        include: { oems: true, sldOems: true, state: true }
      });
      if (dealer) {
        return {
            id: dealer.id,
            name: dealer.name,
            phone: dealer.phone,
            role: 'DEALER_USER',
            status: dealer.status,
            stateCode: dealer.stateCode,
            stateName: dealer.state?.name,
            oems: dealer.oems.map(o => o.name).join(', '),
            sldOems: dealer.sldOems.map((o) => ({
              id: o.id,
              code: o.code,
              name: o.name,
            })),
            hasSldAccess: dealer.sldOems.length > 0,
            hasReflectiveAccess: dealer.oems.length > 0,
            passingRtosAll: dealer.passingRtosAll,
            passingRtoCodes: dealer.passingRtoCodes,
            dealerUpdatedAt: dealer.updatedAt.toISOString(),
        };
      }
    } else {
       const user = await this.prisma.user.findUnique({
         where: { id: userId },
         include: {
           authorizedSldOems: { select: { id: true, code: true, name: true } },
         },
       });
       if (user) {
          const { password, authorizedSldOems, ...result } = user;
          const isFullAdmin =
            result.role === 'SUPER_ADMIN' || result.role === 'ADMIN';
          if (result.role === 'SLD_ADMIN') {
            return {
              ...result,
              hasSldAccess: authorizedSldOems.length > 0,
              hasReflectiveAccess: false,
              sldOems: authorizedSldOems,
            };
          }
          return {
            ...result,
            hasSldAccess: isFullAdmin ? true : undefined,
            hasReflectiveAccess: isFullAdmin ? true : undefined,
            oems: isFullAdmin ? 'All Reflective OEMs' : undefined,
            sldOems: isFullAdmin
              ? [{ code: 'ALL', name: 'All SLD OEMs' }]
              : undefined,
          };
       }
    }
    return null;
  }
}
