import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators';
import { AuthUser, JwtPayload } from '../types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Autenticação necessária');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(header.slice(7));
    } catch {
      throw new UnauthorizedException('Sessão expirada ou inválida');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, storeId: true, name: true, email: true, active: true, passwordChangedAt: true },
    });
    if (!user || !user.active) throw new UnauthorizedException('Usuário inativo');
    if (payload.pwdv === undefined || payload.pwdv !== user.passwordChangedAt.getTime()) {
      throw new UnauthorizedException('Sessão expirada');
    }

    req.user = { id: user.id, role: user.role, storeId: user.storeId, name: user.name, email: user.email };
    return true;
  }
}
