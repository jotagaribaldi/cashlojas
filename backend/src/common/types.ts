import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  role: Role;
  storeId: string | null;
  name: string;
  email: string;
}

export interface JwtPayload {
  sub: string;
  role: Role;
  storeId: string | null;
  pwdv?: number;
  iat?: number;
  exp?: number;
}

export interface RequestContext {
  ip?: string;
  userAgent?: string;
}
