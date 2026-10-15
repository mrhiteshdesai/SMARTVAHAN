import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { UserRole } from '@prisma/client';

/** null = unrestricted (all OEMs); string[] = allowed OEM ids */
export type SldOemScope = string[] | null;

export function isSldCertManagerRole(role?: string): boolean {
  return (
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.ADMIN ||
    role === UserRole.SLD_ADMIN
  );
}

export async function resolveSldOemScope(
  prisma: PrismaService,
  user: { userId?: string; role?: string },
): Promise<SldOemScope> {
  if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
    return null;
  }
  if (user.role === UserRole.SLD_ADMIN) {
    if (!user.userId) return [];
    const rows = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { authorizedSldOems: { select: { id: true } } },
    });
    return (rows?.authorizedSldOems || []).map((o) => o.id);
  }
  return [];
}

export function assertOemInScope(scope: SldOemScope, sldOemId: string) {
  if (scope === null) return;
  if (!scope.includes(sldOemId)) {
    throw new ForbiddenException('Not authorized for this SLD OEM');
  }
}

export function applyOemScopeToWhere(where: any, scope: SldOemScope) {
  if (scope === null) return where;
  if (scope.length === 0) {
    where.sldOemId = '__none__';
    return where;
  }
  if (where.sldOemId) {
    if (!scope.includes(where.sldOemId)) {
      where.sldOemId = '__none__';
    }
    return where;
  }
  where.sldOemId = { in: scope };
  return where;
}
