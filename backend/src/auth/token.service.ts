import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload, RequestContext } from '../common/types';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger('Tokens');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  signAccess(user: Pick<User, 'id' | 'role' | 'storeId' | 'passwordChangedAt'>): string {
    const payload: JwtPayload = { sub: user.id, role: user.role, storeId: user.storeId, pwdv: user.passwordChangedAt.getTime() };
    return this.jwt.sign(payload);
  }

  async issue(user: Pick<User, 'id' | 'role' | 'storeId' | 'passwordChangedAt'>, ctx: RequestContext, familyId?: string): Promise<IssuedTokens> {
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }) * 86_400_000);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId: familyId ?? randomUUID(),
        tokenHash: this.hash(refreshToken),
        passwordChangedAt: user.passwordChangedAt,
        expiresAt: refreshExpiresAt,
        userAgent: ctx.userAgent,
        ip: ctx.ip,
      },
    });
    return { accessToken: this.signAccess(user), refreshToken, refreshExpiresAt };
  }

  async rotate(refreshToken: string, ctx: RequestContext): Promise<{ tokens: IssuedTokens; userId: string }> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(refreshToken) },
      include: { user: { select: { id: true, role: true, storeId: true, active: true, lockedUntil: true, passwordChangedAt: true } } },
    });
    if (!existing) throw new UnauthorizedException('Sessão inválida');

    if (existing.revokedAt) {
      this.logger.warn(`Reuso de refresh token detectado (família ${existing.familyId}, usuário ${existing.userId})`);
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Sessão inválida');
    }
    if (existing.passwordChangedAt.getTime() !== existing.user.passwordChangedAt.getTime()) {
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Sessão invalidada por alteração de segurança');
    }
    if (existing.expiresAt <= new Date() || !existing.user.active) {
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Sessão expirada');
    }
    if (existing.user.lockedUntil && existing.user.lockedUntil > new Date()) {
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Conta temporariamente bloqueada');
    }

    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count !== 1) {
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Sessão inválida');
    }

    const tokens = await this.issue(existing.user, ctx, existing.familyId);
    const created = await this.prisma.refreshToken.findUnique({ where: { tokenHash: this.hash(tokens.refreshToken) } });
    await this.prisma.refreshToken.update({ where: { id: existing.id }, data: { replacedBy: created?.id } });
    return { tokens, userId: existing.userId };
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
