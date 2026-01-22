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
    // Check System Users
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (user) {
        const isValid = await bcrypt.compare(pass, user.password);
        if (isValid && user.status === 'ACTIVE') {
            const { password, ...result } = user;
            return result;
        }
    }

    // Check Dealers
    const dealer = await this.prisma.dealer.findUnique({ where: { phone } });
    if (dealer) {
        const isValid = await bcrypt.compare(pass, dealer.password);
        if (isValid && dealer.status === 'ACTIVE') {
            return {
                id: dealer.id,
                name: dealer.name,
                phone: dealer.phone,
                role: 'DEALER_USER', // Map to enum if needed, or unify
                status: dealer.status
            };
        }
    }

    return null;
  }

  async login(user: any, ipAddress?: string) {
    const payload = { sub: user.id, role: user.role, phone: user.phone };
    return {
      ok: true,
      user: user,
      accessToken: await this.jwt.signAsync(payload),
    };
  }
}
