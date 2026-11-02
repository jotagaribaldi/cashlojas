import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CreditStatus, Prisma, RedemptionRequestStatus, RedemptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateProfileDto } from './dto';

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
    await this.audit.log({ userId, action: 'PROFILE_UPDATED', entity: 'Customer', entityId: c.id, metadata: { before: { name: c.name, email: c.email, rg: c.rg }, after: { name: dto.name, email: dto.email, rg: dto.rg } } });
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
    await this.audit.log({ userId, action: 'CUSTOMER_SELF_ENROLLED', entity: 'Customer', entityId: customer.id, storeId, metadata: { storeId } });
    return { enrolled: true };
  }

  async redemptionRequests(userId: string) {
    const customer = await this.customerFor(userId);
    return this.prisma.redemptionRequest.findMany({
      where: { customerId: customer.id, status: RedemptionRequestStatus.OPEN },
      orderBy: { createdAt: 'desc' },
      select: { id: true, storeId: true, createdAt: true, store: { select: { name: true } } },
    });
  }

  async requestRedemption(userId: string, storeId: string) {
    const customer = await this.customerFor(userId);
    const enrolled = await this.prisma.customerStore.findUnique({
      where: { customerId_storeId: { customerId: customer.id, storeId } },
      select: { storeId: true },
    });
    if (!enrolled) throw new NotFoundException('Você não participa desta loja');
    const open = await this.prisma.redemptionRequest.findFirst({
      where: { customerId: customer.id, storeId, status: RedemptionRequestStatus.OPEN },
      select: { id: true },
    });
    if (open) throw new ConflictException('Você já possui uma solicitação de resgate em aberto nesta loja');
    const balance = await this.prisma.cashbackCredit.aggregate({
      where: { customerId: customer.id, storeId, status: CreditStatus.ACTIVE, remainingCents: { gt: 0 }, expiresAt: { gt: new Date() } },
      _sum: { remainingCents: true },
    });
    if (!(balance._sum.remainingCents ?? 0)) throw new ConflictException('Você não possui saldo disponível nesta loja');
    const created = await this.prisma.redemptionRequest.create({ data: { customerId: customer.id, storeId }, select: { id: true } });
    await this.audit.log({ userId, action: 'REDEMPTION_REQUEST_CREATED', entity: 'RedemptionRequest', entityId: created.id, storeId, metadata: { customerId: customer.id, storeId, balanceCents: balance._sum.remainingCents ?? 0 } });
    return created;
  }

  async cancelRedemptionRequest(userId: string, id: string) {
    const customer = await this.customerFor(userId);
    const result = await this.prisma.redemptionRequest.updateMany({
      where: { id, customerId: customer.id, status: RedemptionRequestStatus.OPEN },
      data: { status: RedemptionRequestStatus.CANCELLED },
    });
    if (!result.count) throw new NotFoundException('Solicitação não encontrada');
    await this.audit.log({ userId, action: 'REDEMPTION_REQUEST_CANCELLED', entity: 'RedemptionRequest', entityId: id, metadata: { customerId: customer.id } });
    return { cancelled: true };
  }

  async purchases(userId: string, page: number, pageSize: number) {
    const customer = await this.customerFor(userId);
    const where: Prisma.PurchaseWhereInput = { customerId: customer.id };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.purchase.count({ where }),
      this.prisma.purchase.findMany({
        where,
        orderBy: { purchaseDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, purchaseDate: true, amountCents: true, cashbackCents: true, fiscalDocument: true, store: { select: { name: true } } },
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async ranking(userId: string, storeId: string) {
    const customer = await this.customerFor(userId);
    const enrolled = await this.prisma.customerStore.findUnique({
      where: { customerId_storeId: { customerId: customer.id, storeId } },
      select: { storeId: true, store: { select: { name: true } } },
    });
    if (!enrolled) throw new NotFoundException('Você não participa desta loja');
    const grouped = await this.prisma.purchase.groupBy({
      by: ['customerId'],
      where: { storeId },
      _sum: { amountCents: true },
      orderBy: { _sum: { amountCents: 'desc' } },
    });
    const rows = grouped.map((g) => ({ customerId: g.customerId, totalCents: g._sum.amountCents ?? 0 }));
    const idx = rows.findIndex((r) => r.customerId === customer.id);
    const myTotal = idx >= 0 ? rows[idx].totalCents : 0;
    const position = idx >= 0 ? idx + 1 : rows.length + 1;
    const participants = Math.max(rows.length, idx >= 0 ? rows.length : rows.length + 1);
    const topRows = rows.slice(0, 10);
    const names = await this.prisma.customer.findMany({ where: { id: { in: topRows.map((r) => r.customerId) } }, select: { id: true, name: true } });
    const nameOf = new Map(names.map((n) => [n.id, n.name]));
    const mask = (full: string) => {
      const [first, ...rest] = full.trim().split(/\s+/);
      return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
    };
    const ahead = idx > 0 ? rows[idx - 1].totalCents : idx < 0 && rows.length ? rows[rows.length - 1].totalCents : null;
    return {
      storeName: enrolled.store.name,
      position,
      participants,
      totalCents: myTotal,
      centsToNextPosition: ahead === null ? 0 : Math.max(ahead - myTotal + 1, 0),
      top: topRows.map((r, i) => ({
        position: i + 1,
        name: r.customerId === customer.id ? 'Você' : mask(nameOf.get(r.customerId) ?? 'Cliente'),
        totalCents: r.totalCents,
        isMe: r.customerId === customer.id,
      })),
    };
  }
}
