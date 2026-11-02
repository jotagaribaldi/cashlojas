import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CreditStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class CashbackService {
  private readonly logger = new Logger('Cashback');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
    return count;
  }
}
