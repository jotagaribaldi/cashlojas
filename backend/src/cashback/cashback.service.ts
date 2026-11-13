import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { CreditSource, CreditStatus, Prisma } from '@prisma/client';
import { formatBRL } from '../common/utils/money';
import { addDaysToDateString, endOfDayInOffset, formatDateBR, todayInOffset } from '../common/utils/dates';
import { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TelegramService } from '../notifications/telegram.service';

type Db = Prisma.TransactionClient | PrismaService;

export interface SignupBonusInput {
  customerId: string;
  storeId: string;
  signupBonusCents: number;
  validityDays: number;
  actor?: { userId?: string | null; role?: string | null };
  ip?: string;
}

@Injectable()
export class CashbackService {
  private readonly logger = new Logger('Cashback');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly telegram: TelegramService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Concede o bônus de cadastro da loja ao cliente vinculado.
   * Idempotente: a chave única (customerId:storeId) em signupBonusKey
   * garante no máximo um bônus por cliente/loja, mesmo com cadastros concorrentes.
   */
  async grantSignupBonus(tx: Prisma.TransactionClient, input: SignupBonusInput): Promise<number> {
    if (input.signupBonusCents <= 0) return 0;
    const offset = this.config.get('BUSINESS_UTC_OFFSET', { infer: true });
    const expiresAt = endOfDayInOffset(
      addDaysToDateString(todayInOffset(offset), input.validityDays),
      offset,
    );
    const created = await tx.cashbackCredit.createMany({
      data: [
        {
          customerId: input.customerId,
          storeId: input.storeId,
          source: CreditSource.SIGNUP_BONUS,
          signupBonusKey: `${input.customerId}:${input.storeId}`,
          amountCents: input.signupBonusCents,
          remainingCents: input.signupBonusCents,
          expiresAt,
        },
      ],
      skipDuplicates: true,
    });
    if (!created.count) return 0;
    await this.audit.log(
      {
        userId: input.actor?.userId ?? null,
        role: input.actor?.role ?? null,
        storeId: input.storeId,
        action: 'CASHBACK_SIGNUP_BONUS_GRANTED',
        entity: 'Customer',
        entityId: input.customerId,
        metadata: {
          storeId: input.storeId,
          bonusCents: input.signupBonusCents,
          expiresAt: expiresAt.toISOString(),
        },
        ip: input.ip,
      },
      tx,
    );
    return input.signupBonusCents;
  }

  async lockCustomer(tx: Prisma.TransactionClient, customerId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${customerId}))`;
  }

  activeCredits(customerId: string, storeId: string, db: Db = this.prisma) {
    return db.cashbackCredit.findMany({
      where: {
        customerId,
        storeId,
        status: CreditStatus.ACTIVE,
        remainingCents: { gt: 0 },
        expiresAt: { gt: new Date() },
      },
      orderBy: { expiresAt: 'asc' },
      select: { id: true, remainingCents: true, expiresAt: true, amountCents: true, earnedAt: true },
    });
  }

  async balance(customerId: string, storeId: string, db: Db = this.prisma): Promise<number> {
    const agg = await db.cashbackCredit.aggregate({
      where: { customerId, storeId, status: CreditStatus.ACTIVE, expiresAt: { gt: new Date() } },
      _sum: { remainingCents: true },
    });
    return agg._sum.remainingCents ?? 0;
  }

  @Cron('0 5 3 * * *')
  async expireCredits(): Promise<number> {
    const now = new Date();
    const due = await this.prisma.cashbackCredit.findMany({
      where: { status: CreditStatus.ACTIVE, expiresAt: { lte: now } },
      select: { id: true, customerId: true, storeId: true, remainingCents: true, amountCents: true, expiresAt: true },
    });
    let count = 0;
    for (const c of due) {
      await this.prisma.$transaction(async (tx) => {
        const r = await tx.cashbackCredit.updateMany({ where: { id: c.id, status: CreditStatus.ACTIVE }, data: { status: CreditStatus.EXPIRED } });
        if (!r.count) return;
        count++;
        await this.audit.log(
          {
            userId: null,
            role: 'SYSTEM',
            storeId: c.storeId,
            action: 'CASHBACK_EXPIRED',
            entity: 'CashbackCredit',
            entityId: c.id,
            metadata: { customerId: c.customerId, expiredCents: c.remainingCents, originalCents: c.amountCents, expiresAt: c.expiresAt.toISOString() },
          },
          tx,
        );
      });
    }
    if (count) this.logger.log(`${count} crédito(s) de cashback expirado(s)`);
    if (count) this.telegram.notify('Cashback expirado', `${count} crédito(s) de cashback expirado(s) automaticamente`);
    return count;
  }

  @Cron('0 0 9 * * *')
  async notifyExpiringCredits(): Promise<number> {
    const now = new Date();
    const inTwoDays = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const credits = await this.prisma.cashbackCredit.findMany({
      where: {
        status: CreditStatus.ACTIVE,
        remainingCents: { gt: 0 },
        expiresAt: { gt: now, lte: inTwoDays },
      },
      select: {
        id: true,
        customerId: true,
        storeId: true,
        remainingCents: true,
        expiresAt: true,
        customer: { select: { name: true, email: true } },
        store: { select: { name: true } },
      },
    });

    const offset = '-03:00';
    let count = 0;
    for (const c of credits) {
      this.notifications.notifyExpiringCredit({
        customerName: c.customer.name,
        email: c.customer.email,
        storeName: c.store.name,
        cashbackCents: c.remainingCents,
        expiresAt: c.expiresAt,
      });
      await this.audit.log({
        userId: null,
        role: 'SYSTEM',
        storeId: c.storeId,
        action: 'CASHBACK_EXPIRY_WARNING_SENT',
        entity: 'CashbackCredit',
        entityId: c.id,
        metadata: { customerId: c.customerId, remainingCents: c.remainingCents, expiresAt: c.expiresAt.toISOString() },
      });
      count++;
    }
    if (count) this.logger.log(`${count} aviso(s) de expiração de cashback enviado(s)`);
    if (count) this.telegram.notify('Aviso de expiração enviado', `${count} email(s) de aviso de cashback expirando enviado(s)`);
    return count;
  }
}
