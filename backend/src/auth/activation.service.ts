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

  async issueLink(customerId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const ttlHours = this.config.get('ACTIVATION_TTL_HOURS', { infer: true });
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.activationToken.updateMany({
        where: { customerId, usedAt: null, expiresAt: { gt: now } },
        data: { expiresAt: now },
      }),
      this.prisma.activationToken.create({
        data: { customerId, tokenHash: this.hash(token), expiresAt: new Date(now.getTime() + ttlHours * 3_600_000) },
      }),
    ]);
    const base = this.config.get('APP_PUBLIC_URL', { infer: true }).replace(/\/+$/, '');
    return `${base}/ativar?token=${token}`;
  }

  private async findValid(token: string) {
    const record = await this.prisma.activationToken.findUnique({
      where: { tokenHash: this.hash(token) },
      include: { customer: true },
    });
    if (!record || record.usedAt || record.expiresAt <= new Date()) throw new BadRequestException(INVALID_LINK);
    if (record.customer.userId) throw new ConflictException('Esta conta já foi ativada. Entre com seu e-mail e senha.');
    return record;
  }

  async check(token: string) {
    const { customer } = await this.findValid(token);
    return { name: customer.name, email: customer.email };
  }

  async activate(token: string, password: string, ctx: RequestContext) {
    const record = await this.findValid(token);
    const { customer } = record;
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
}
