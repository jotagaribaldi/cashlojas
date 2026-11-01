import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { AuthUser, RequestContext } from './types';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';
export const CSRF_KEY = 'csrfProtected';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
export const CsrfProtected = () => SetMetadata(CSRF_KEY, true);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>();
  return req.user;
});

export const ReqContext = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestContext => {
  const req = ctx.switchToHttp().getRequest<Request>();
  const ua = req.headers['user-agent'];
  return { ip: req.ip, userAgent: typeof ua === 'string' ? ua.slice(0, 255) : undefined };
});
