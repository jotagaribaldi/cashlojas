import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreditStatus, Prisma, RedemptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto';

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  private async customerFor(userId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { userId } });
    if (!customer) throw new NotFoundException('Cadastro de cliente não encontrado');
    return customer;
  }

  async profile(userId: string) {
    const c = await this.customerFor(userId);
    return { id: c.id, name: c.name, phone: c.phone, email: c.email, rg: c.rg, createdAt: c.createdAt };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const c = await this.customerFor(userId);
    if (dto.email !== c.email) {
      const [otherCustomer, otherUser] = await Promise.all([
        this.prisma.customer.findUnique({ where: { email: dto.email }, select: { id: true } }),
        this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } }),
      ]);
      if (otherCustomer || (otherUser && otherUser.id !== userId)) throw new ConflictException('Este e-mail já está em uso');
    }
    await this.prisma.$transaction([
      this.prisma.customer.update({ where: { id: c.id }, data: { name: dto.name, email: dto.email, rg: dto.rg } }),
      this.prisma.user.update({ where: { id: userId }, data: { name: dto.name, email: dto.email } }),
    ]);
    return this.profile(userId);
  }

  async summary(userId: string) {
    const customer = await this.customerFor(userId);
    const now = new Date();
    const enrollments = await this.prisma.customerStore.findMany({
      where: { customerId: customer.id },
      include: {
        store: {
          select: {
            id: true,
            name: true,
            segment: true,
            cashbackPercentBps: true,
            validityDays: true,
            group: { select: { name: true } },
          },
        },
      },
      orderBy: { enrolledAt: 'asc' },
    });
    const credits = await this.prisma.cashbackCredit.findMany({
      where: { customerId: customer.id, status: CreditStatus.ACTIVE, remainingCents: { gt: 0 }, expiresAt: { gt: now } },
      orderBy: { expiresAt: 'asc' },
      select: { id: true, storeId: true, remainingCents: true, expiresAt: true },
    });

    const stores = enrollments.map(({ store }) => {
      const own = credits.filter((c) => c.storeId === store.id);
      return {
        ...store,
        balanceCents: own.reduce((acc, c) => acc + c.remainingCents, 0),
        nextExpiration: own[0] ? { expiresAt: own[0].expiresAt, amountCents: own[0].remainingCents } : null,
      };
    });

    const [earned, redeemed, expired] = await Promise.all([
      this.prisma.cashbackCredit.aggregate({ where: { customerId: customer.id }, _sum: { amountCents: true } }),
      this.prisma.redemption.aggregate({
        where: { customerId: customer.id, status: RedemptionStatus.APPROVED },
        _sum: { discountCents: true },
      }),
      this.prisma.cashbackCredit.aggregate({
        where: { customerId: customer.id, OR: [{ status: CreditStatus.EXPIRED }, { status: CreditStatus.ACTIVE, expiresAt: { lte: now } }] },
        _sum: { remainingCents: true },
      }),
    ]);

    return {
      customer: { name: customer.name },
      totalBalanceCents: stores.reduce((acc, s) => acc + s.balanceCents, 0),
      totalEarnedCents: earned._sum.amountCents ?? 0,
      totalRedeemedCents: redeemed._sum.discountCents ?? 0,
      totalExpiredCents: expired._sum.remainingCents ?? 0,
      upcomingExpirations: credits.slice(0, 5).map((c) => ({
        ...c,
        storeName: stores.find((s) => s.id === c.storeId)?.name ?? '',
      })),
      stores,
    };
  }

  async credits(userId: string, page: number, pageSize: number) {
    const customer = await this.customerFor(userId);
    const where: Prisma.CashbackCreditWhereInput = { customerId: customer.id };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.cashbackCredit.count({ where }),
      this.prisma.cashbackCredit.findMany({
        where,
        orderBy: { earnedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          store: { select: { name: true } },
          purchase: { select: { purchaseDate: true, amountCents: true, fiscalDocument: true } },
        },
      }),
    ]);
    const now = new Date();
    return {
      total,
      page,
      pageSize,
      items: items.map((c) => ({
        ...c,
        status: c.status === CreditStatus.ACTIVE && c.expiresAt <= now ? CreditStatus.EXPIRED : c.status,
      })),
    };
  }

  async redemptions(userId: string, page: number, pageSize: number) {
    const customer = await this.customerFor(userId);
    const where: Prisma.RedemptionWhereInput = { customerId: customer.id, status: RedemptionStatus.APPROVED };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.redemption.count({ where }),
      this.prisma.redemption.findMany({
        where,
        orderBy: { decidedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          authorizationCode: true,
          purchaseAmountCents: true,
          discountCents: true,
          decidedAt: true,
          fiscalDocument: true,
          store: { select: { name: true } },
          manager: { select: { name: true } },
        },
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async stores(userId: string) {
    const customer = await this.customerFor(userId);
    const [stores, enrolled] = await Promise.all([
      this.prisma.store.findMany({
        where: { active: true, group: { active: true } },
        orderBy: [{ group: { name: 'asc' } }, { name: 'asc' }],
        select: { id: true, name: true, segment: true, validityDays: true, cashbackPercentBps: true, group: { select: { name: true } } },
      }),
      this.prisma.customerStore.findMany({ where: { customerId: customer.id }, select: { storeId: true } }),
    ]);
    const ids = new Set(enrolled.map((e) => e.storeId));
    return stores.map((s) => ({ ...s, enrolled: ids.has(s.id) }));
  }

  async enroll(userId: string, storeId: string) {
    const customer = await this.customerFor(userId);
    const store = await this.prisma.store.findFirst({ where: { id: storeId, active: true }, select: { id: true } });
    if (!store) throw new NotFoundException('Loja não encontrada');
    await this.prisma.customerStore.upsert({
      where: { customerId_storeId: { customerId: customer.id, storeId } },
      update: {},
      create: { customerId: customer.id, storeId },
    });
    return { enrolled: true };
  }
}
