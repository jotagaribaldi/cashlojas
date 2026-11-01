import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CreditStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

@Injectable()
export class CashbackService {
  private readonly logger = new Logger('Cashback');

  constructor(private readonly prisma: PrismaService) {}

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
    const result = await this.prisma.cashbackCredit.updateMany({
      where: { status: CreditStatus.ACTIVE, expiresAt: { lte: new Date() } },
      data: { status: CreditStatus.EXPIRED },
    });
    if (result.count) this.logger.log(`${result.count} crédito(s) de cashback expirado(s)`);
    return result.count;
  }
}
