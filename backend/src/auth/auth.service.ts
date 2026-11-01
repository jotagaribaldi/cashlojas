import {
  BadRequestException,
  ConflictException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuditService } from '../audit/audit.service';
import { RequestContext } from '../common/types';
import { normalizePhone } from '../common/utils/phone';
import { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto, LoginDto, RegisterCustomerDto } from './dto';
import { TokenService } from './token.service';

export const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export function publicUser(user: Pick<User, 'id' | 'name' | 'email' | 'role' | 'storeId'>) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, storeId: user.storeId };
}

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onModuleInit() {
    this.dummyHash = await hashPassword('dummy-password-for-timing-Aa1!');
  }

  async verifyCredentials(email: string, password: string, ctx: RequestContext): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      await argon2.verify(this.dummyHash, password).catch(() => false);
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.audit.log({ userId: user.id, action: 'LOGIN_BLOCKED', entity: 'User', entityId: user.id, ip: ctx.ip });
      throw new UnauthorizedException('Conta temporariamente bloqueada por excesso de tentativas. Tente mais tarde.');
    }

    const valid = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!valid) {
      const max = this.config.get('LOGIN_MAX_ATTEMPTS', { infer: true });
      const lock = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: { increment: 1 } },
          select: { failedLoginAttempts: true },
        });
        if (updated.failedLoginAttempts < max) return false;
        await tx.user.update({
          where: { id: user.id },
          data: {
            failedLoginAttempts: 0,
            lockedUntil: new Date(Date.now() + this.config.get('LOGIN_LOCK_MINUTES', { infer: true }) * 60_000),
            passwordChangedAt: new Date(),
          },
        });
        return true;
      });
      await this.audit.log({
        userId: user.id,
        action: lock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
        entity: 'User',
        entityId: user.id,
        ip: ctx.ip,
      });
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }
    if (!user.active) throw new UnauthorizedException('Usuário inativo');

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
    }
    return user;
  }

  async login(dto: LoginDto, ctx: RequestContext) {
    const user = await this.verifyCredentials(dto.email, dto.password, ctx);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const issued = await this.tokens.issue(user, ctx);
    await this.audit.log({ userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id, ip: ctx.ip });
    return { ...issued, user: publicUser(user) };
  }

  async register(dto: RegisterCustomerDto, ctx: RequestContext) {
    const phone = normalizePhone(dto.phone);
    if (!phone) throw new BadRequestException('Telefone inválido. Informe DDD + número.');

    const storeIds = [...new Set(dto.storeIds ?? [])];
    if (storeIds.length) {
      const count = await this.prisma.store.count({ where: { id: { in: storeIds }, active: true } });
      if (count !== storeIds.length) throw new BadRequestException('Uma ou mais lojas selecionadas são inválidas');
    }

    const emailInUse = await this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } });
    if (emailInUse) throw new ConflictException('Não foi possível concluir o cadastro com estes dados');

    const existing = await this.prisma.customer.findUnique({ where: { phone } });
    if (existing && (existing.userId || existing.email !== dto.email || existing.rg !== dto.rg)) {
      throw new ConflictException('Não foi possível concluir o cadastro com estes dados');
    }
    if (!existing) {
      const emailCustomer = await this.prisma.customer.findUnique({ where: { email: dto.email }, select: { id: true } });
      if (emailCustomer) throw new ConflictException('Não foi possível concluir o cadastro com estes dados');
    }

    const passwordHash = await hashPassword(dto.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name: dto.name, email: dto.email, passwordHash, role: Role.CUSTOMER },
      });
      const customer = existing
        ? await tx.customer.update({ where: { id: existing.id }, data: { userId: created.id, name: dto.name } })
        : await tx.customer.create({
            data: { userId: created.id, name: dto.name, phone, rg: dto.rg, email: dto.email },
          });
      if (storeIds.length) {
        await tx.customerStore.createMany({
          data: storeIds.map((storeId) => ({ customerId: customer.id, storeId })),
          skipDuplicates: true,
        });
      }
      await this.audit.log(
        { userId: created.id, action: 'CUSTOMER_REGISTERED', entity: 'Customer', entityId: customer.id, ip: ctx.ip },
        tx,
      );
      return created;
    });

    const issued = await this.tokens.issue(user, ctx);
    return { ...issued, user: publicUser(user) };
  }

  async refresh(refreshToken: string | undefined, ctx: RequestContext) {
    if (!refreshToken) throw new UnauthorizedException('Sessão expirada');
    const { tokens, userId } = await this.tokens.rotate(refreshToken, ctx);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { ...tokens, user: publicUser(user) };
  }

  async logout(refreshToken: string | undefined) {
    if (refreshToken) await this.tokens.revoke(refreshToken);
  }

  async logoutAll(userId: string, ctx?: RequestContext) {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordChangedAt: new Date() } });
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.log({ userId, action: 'ALL_SESSIONS_REVOKED', entity: 'User', entityId: userId, ip: ctx?.ip }, tx);
    });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { store: { select: { id: true, name: true, segment: true, group: { select: { id: true, name: true } } } } },
    });
    return { ...publicUser(user), store: user.store };
  }

  async changePassword(userId: string, dto: ChangePasswordDto, ctx: RequestContext) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const valid = await argon2.verify(user.passwordHash, dto.currentPassword).catch(() => false);
    if (!valid) throw new BadRequestException('Senha atual incorreta');
    if (dto.currentPassword === dto.newPassword) throw new BadRequestException('A nova senha deve ser diferente da atual');

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(dto.newPassword), passwordChangedAt: new Date(Date.now() - 1000) },
    });
    await this.tokens.revokeAllForUser(userId);
    await this.audit.log({ userId, action: 'PASSWORD_CHANGED', entity: 'User', entityId: userId, ip: ctx.ip });
  }
}
