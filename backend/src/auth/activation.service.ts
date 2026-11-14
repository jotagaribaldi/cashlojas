import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { RequestContext } from '../common/types';
import { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, publicUser } from './auth.service';
import { TokenService } from './token.service';

const INVALID_LINK = 'Link inválido ou expirado. Peça um novo link de acesso na loja.';
const INVALID_INVITE = 'Convite inválido ou expirado. Peça um novo convite ao administrador.';

@Injectable()
export class ActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private link(token: string): string {
    const base = this.config.get('APP_PUBLIC_URL', { infer: true }).replace(/\/+$/, '');
    return `${base}/ativar?token=${token}`;
  }

  private expiry(): Date {
    const ttlHours = this.config.get('ACTIVATION_TTL_HOURS', { infer: true });
    return new Date(Date.now() + ttlHours * 3_600_000);
  }

  async issueLink(customerId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.activationToken.updateMany({
        where: { customerId, usedAt: null, expiresAt: { gt: now } },
        data: { expiresAt: now },
      }),
      this.prisma.activationToken.create({
        data: { customerId, tokenHash: this.hash(token), expiresAt: this.expiry() },
      }),
    ]);
    return this.link(token);
  }

  /** Convite para síndico ou usuário de administradora: a conta já existe, falta a senha. */
  async issueUserLink(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.activationToken.updateMany({
        where: { userId, usedAt: null, expiresAt: { gt: now } },
        data: { expiresAt: now },
      }),
      this.prisma.activationToken.create({
        data: { userId, tokenHash: this.hash(token), expiresAt: this.expiry() },
      }),
    ]);
    return this.link(token);
  }

  private async findValid(token: string) {
    const record = await this.prisma.activationToken.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { customer: true, user: true },
    });
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw new BadRequestException(record?.userId ? INVALID_INVITE : INVALID_LINK);
    }
    if (record.userId) return record;
    if (!record.customer) throw new BadRequestException(INVALID_LINK);
    if (record.customer.userId) throw new ConflictException('Esta conta já foi ativada. Entre com seu e-mail e senha.');
    return record;
  }

  async check(token: string) {
    const record = await this.findValid(token);
    if (record.user) return { name: record.user.name, email: record.user.email, kind: 'USER' as const };
    return { name: record.customer!.name, email: record.customer!.email, kind: 'CUSTOMER' as const };
  }

  async activate(token: string, password: string, ctx: RequestContext) {
    const record = await this.findValid(token);
    if (record.userId) return this.activateUser(record, password, ctx);

    const { customer } = record;
    if (!customer) throw new BadRequestException(INVALID_LINK);
    const emailInUse = await this.prisma.user.findUnique({ where: { email: customer.email }, select: { id: true } });
    if (emailInUse) throw new ConflictException('Não foi possível ativar a conta. Procure a loja para regularizar o cadastro.');

    const passwordHash = await hashPassword(password);
    const user = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.activationToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw new BadRequestException(INVALID_LINK);
      const created = await tx.user.create({
        data: { name: customer.name, email: customer.email, passwordHash, role: Role.CUSTOMER },
      });
      await tx.customer.update({ where: { id: customer.id }, data: { userId: created.id } });
      await this.audit.log(
        { userId: created.id, action: 'CUSTOMER_ACTIVATED', entity: 'Customer', entityId: customer.id, ip: ctx.ip },
        tx,
      );
      return created;
    });
    const issued = await this.tokens.issue(user, ctx);
    return { ...issued, user: publicUser(user) };
  }

  private async activateUser(
    record: { id: string; user: { id: string; name: string; email: string; role: Role } | null },
    password: string,
    ctx: RequestContext,
  ) {
    const invited = record.user;
    if (!invited) throw new BadRequestException(INVALID_INVITE);
    const passwordHash = await hashPassword(password);
    const user = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.activationToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) throw new BadRequestException(INVALID_INVITE);
      const updated = await tx.user.update({
        where: { id: invited.id },
        data: { passwordHash, passwordChangedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
      });
      await this.audit.log(
        { userId: updated.id, action: 'USER_INVITE_ACCEPTED', entity: 'User', entityId: updated.id, metadata: { role: updated.role }, ip: ctx.ip },
        tx,
      );
      return updated;
    });
    const issued = await this.tokens.issue(user, ctx);
    return { ...issued, user: publicUser(user) };
  }
}
