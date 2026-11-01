import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreditStatus, RedemptionStatus, Role } from '@prisma/client';
import { IsDateString, IsOptional } from 'class-validator';
import { CurrentUser, Public, Roles } from '../common/decorators';
import { AuthUser } from '../common/types';
import { addDaysToDateString, todayInOffset } from '../common/utils/dates';
import { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

export class ReportQuery {
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async storeReport(storeId: string | null, q: ReportQuery) {
    const today = todayInOffset(this.config.get('BUSINESS_UTC_OFFSET', { infer: true }));
    const from = q.from?.slice(0, 10) ?? addDaysToDateString(today, -30);
    const to = q.to?.slice(0, 10) ?? today;
    const dateRange = { gte: new Date(from), lte: new Date(to) };
    const tsRange = { gte: new Date(`${from}T00:00:00Z`), lt: new Date(`${addDaysToDateString(to, 1)}T00:00:00Z`) };
    const now = new Date();

    const [purchases, redemptions, pending, active, expired, customers] = await Promise.all([
      this.prisma.purchase.aggregate({
        where: { ...(storeId ? { storeId } : {}), purchaseDate: dateRange },
        _sum: { amountCents: true, cashbackCents: true },
        _count: true,
      }),
      this.prisma.redemption.aggregate({
        where: { ...(storeId ? { storeId } : {}), status: RedemptionStatus.APPROVED, decidedAt: tsRange },
        _sum: { discountCents: true },
        _count: true,
      }),
      this.prisma.redemption.count({ where: { ...(storeId ? { storeId } : {}), status: RedemptionStatus.PENDING } }),
      this.prisma.cashbackCredit.aggregate({
        where: { ...(storeId ? { storeId } : {}), status: CreditStatus.ACTIVE, expiresAt: { gt: now } },
        _sum: { remainingCents: true },
      }),
      this.prisma.cashbackCredit.aggregate({
        where: { ...(storeId ? { storeId } : {}), expiresAt: { ...tsRange, lte: now }, status: { in: [CreditStatus.ACTIVE, CreditStatus.EXPIRED] } },
        _sum: { remainingCents: true },
      }),
      this.prisma.customerStore.count({ where: storeId ? { storeId } : {} }),
    ]);

    return {
      from,
      to,
      purchasesCount: purchases._count,
      salesCents: purchases._sum.amountCents ?? 0,
      cashbackIssuedCents: purchases._sum.cashbackCents ?? 0,
      redemptionsCount: redemptions._count,
      cashbackRedeemedCents: redemptions._sum.discountCents ?? 0,
      cashbackExpiredCents: expired._sum.remainingCents ?? 0,
      outstandingBalanceCents: active._sum.remainingCents ?? 0,
      pendingRedemptions: pending,
      enrolledCustomers: customers,
    };
  }

  publicStores() {
    return this.prisma.store.findMany({
      where: { active: true, group: { active: true } },
      orderBy: [{ group: { name: 'asc' } }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        segment: true,
        validityDays: true,
        cashbackPercentBps: true,
        group: { select: { name: true } },
      },
    });
  }
}

@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Roles(Role.ROOT, Role.MANAGER, Role.CASHIER)
  @Get('reports/store')
  store(@CurrentUser() user: AuthUser, @Query() q: ReportQuery) {
    return this.reports.storeReport(user.storeId, q);
  }

  @Public()
  @Get('stores/public')
  publicStores() {
    return this.reports.publicStores();
  }

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', time: new Date().toISOString() };
  }
}
