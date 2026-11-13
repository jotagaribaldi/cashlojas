import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CommissionStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/types';
import { formatBRL } from '../common/utils/money';
import { TelegramService } from '../notifications/telegram.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly telegram: TelegramService,
  ) {}

  async list(storeId: string, status: CommissionStatus | undefined, search: string | undefined, page: number, pageSize: number) {
    const digits = search?.replace(/\D/g, '') ?? '';
    const where: Prisma.ReferralCommissionWhereInput = {
      storeId,
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { professional: { name: { contains: search, mode: 'insensitive' } } },
              ...(digits ? [{ professional: { phone: { contains: digits } } }] : []),
              { purchase: { customer: { name: { contains: search, mode: 'insensitive' } } } },
              { purchase: { fiscalDocument: { contains: search.toUpperCase() } } },
            ],
          }
        : {}),
    };
    const [total, items, pending, paid] = await this.prisma.$transaction([
      this.prisma.referralCommission.count({ where }),
      this.prisma.referralCommission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          professional: { select: { id: true, name: true, phone: true } },
          purchase: {
            select: {
              id: true,
              fiscalDocument: true,
              purchaseDate: true,
              amountCents: true,
              customer: { select: { id: true, name: true } },
            },
          },
          paidBy: { select: { name: true } },
        },
      }),
      this.prisma.referralCommission.aggregate({ where: { storeId, status: CommissionStatus.PENDING }, _sum: { amountCents: true }, _count: true }),
      this.prisma.referralCommission.aggregate({ where: { storeId, status: CommissionStatus.PAID }, _sum: { amountCents: true }, _count: true }),
    ]);
    return {
      total,
      page,
      pageSize,
      pendingCents: pending._sum.amountCents ?? 0,
      pendingCount: pending._count,
      paidCents: paid._sum.amountCents ?? 0,
      paidCount: paid._count,
      items,
    };
  }

  async pay(id: string, staff: AuthUser, ip?: string) {
    const storeId = staff.storeId!;
    const commission = await this.prisma.referralCommission.findFirst({
      where: { id, storeId },
      include: { professional: { select: { name: true } }, purchase: { select: { fiscalDocument: true } } },
    });
    if (!commission) throw new NotFoundException('Comissão não encontrada nesta loja');
    if (commission.status === CommissionStatus.PAID) throw new ConflictException('Esta comissão já foi paga');
    const updated = await this.prisma.referralCommission.update({
      where: { id },
      data: { status: CommissionStatus.PAID, paidAt: new Date(), paidByUserId: staff.id },
      select: { id: true, status: true, paidAt: true },
    });
    await this.audit.log({
      userId: staff.id,
      action: 'REFERRAL_COMMISSION_PAID',
      entity: 'ReferralCommission',
      entityId: id,
      storeId,
      metadata: {
        professionalCustomerId: commission.professionalCustomerId,
        amountCents: commission.amountCents,
        fiscalDocument: commission.purchase.fiscalDocument,
      },
      ip,
    });
    this.telegram.notify(
      'Comissão paga',
      `Profissional: ${commission.professional.name} • Valor: ${formatBRL(commission.amountCents)}`,
      { userName: staff.name, userRole: staff.role, ip },
    );
    return updated;
  }

  async mine(customerId: string, page: number, pageSize: number) {
    const where: Prisma.ReferralCommissionWhereInput = { professionalCustomerId: customerId };
    const [total, items, pending, paid] = await this.prisma.$transaction([
      this.prisma.referralCommission.count({ where }),
      this.prisma.referralCommission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          store: { select: { name: true } },
          purchase: {
            select: {
              fiscalDocument: true,
              purchaseDate: true,
              amountCents: true,
              customer: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.referralCommission.aggregate({ where: { professionalCustomerId: customerId, status: CommissionStatus.PENDING }, _sum: { amountCents: true }, _count: true }),
      this.prisma.referralCommission.aggregate({ where: { professionalCustomerId: customerId, status: CommissionStatus.PAID }, _sum: { amountCents: true }, _count: true }),
    ]);
    return {
      total,
      page,
      pageSize,
      pendingCents: pending._sum.amountCents ?? 0,
      pendingCount: pending._count,
      paidCents: paid._sum.amountCents ?? 0,
      paidCount: paid._count,
      items,
    };
  }
}
