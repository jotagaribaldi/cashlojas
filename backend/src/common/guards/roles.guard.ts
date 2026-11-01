import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../decorators';
import { AuthUser } from '../types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (!roles || roles.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!req.user || !roles.includes(req.user.role)) {
      throw new ForbiddenException('Você não tem permissão para acessar este recurso');
    }
    if (req.user.role !== Role.ROOT && req.user.role !== Role.CUSTOMER && !req.user.storeId) {
      throw new ForbiddenException('Usuário sem loja vinculada');
    }
    return true;
  }
}
