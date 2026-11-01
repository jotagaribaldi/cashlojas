import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { CSRF_KEY } from '../decorators';

export const CSRF_COOKIE = 'cl_csrf';
export const CSRF_HEADER = 'x-csrf-token';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const enabled = this.reflector.getAllAndOverride<boolean>(CSRF_KEY, [context.getHandler(), context.getClass()]);
    if (!enabled) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const cookie = req.cookies?.[CSRF_COOKIE];
    const header = req.headers[CSRF_HEADER];
    if (typeof cookie !== 'string' || typeof header !== 'string' || cookie.length < 16) {
      throw new ForbiddenException('Token CSRF ausente');
    }
    const a = Buffer.from(cookie);
    const b = Buffer.from(header);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Token CSRF inválido');
    }
    return true;
  }
}
