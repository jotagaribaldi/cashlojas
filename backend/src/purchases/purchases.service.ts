import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { calculateCashback } from '../cashback/cashback.calculator';
import { CashbackService } from '../cashback/cashback.service';
import { AuthUser } from '../common/types';
import { addDaysToDateString, endOfDayInOffset, todayInOffset } from '../common/utils/dates';
import { formatBRL, toCents } from '../common/utils/money';
import { normalizePhone } from '../common/utils/phone';
import { Env } from '../config/env';
import { NotificationsService } from '../notifications/notifications.service';
import { TelegramService } from '../notifications/telegram.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseDto } from './dto';

export const MAX_BACKDATE_DAYS = 7;

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cashback: CashbackService,
    private readonly notifications: NotificationsService,
    private readonly telegram: TelegramService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async create(dto: CreatePurchaseDto, staff: AuthUser, ip?: string) {
    const storeId = staff.storeId!;
    const offset = this.config.get('BUSINESS_UTC_OFFSET', { infer: true });
    const phone = normalizePhone(dto.phone);
    if (!phone) throw new BadRequestException('Telefone inválido. Informe DDD + número.');

    const today = todayInOffset(offset);
    const purchaseDate = dto.purchaseDate ?? today;
    if (purchaseDate > today) throw new BadRequestException('A data da compra não pode ser futura');
    if (purchaseDate < addDaysToDateString(today, -MAX_BACKDATE_DAYS)) {
      throw new BadRequestException(`A data da compra não pode ser anterior a ${MAX_BACKDATE_DAYS} dias`);
    }

    const amountCents = toCents(dto.amount);
    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    if (!store.active) throw new UnprocessableEntityException('Loja inativa');

    const customer = await this.prisma.customer.findUnique({
      where: { phone },
      include: { enrollments: { where: { storeId }, select: { storeId: true } } },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado. O cliente precisa estar cadastrado.');
    if (!customer.cpf) {
      throw new UnprocessableEntityException('Cliente sem CPF cadastrado. Informe o CPF para gerar cashback.');
    }
    if (customer.enrollments.length === 0) {
      throw new UnprocessableEntityException('Cliente não está cadastrado nesta loja. Vincule-o antes de registrar a compra.');
    }

    let referrer: { id: string; name: string; profession: string | null; commissionPercentBps: number } | null = null;
    if (dto.referrerCustomerId) {
      if (dto.referrerCustomerId === customer.id) {
        throw new BadRequestException('O cliente não pode indicar a si mesmo');
      }
      const enrollment = await this.prisma.customerStore.findUnique({
        where: { customerId_storeId: { customerId: dto.referrerCustomerId, storeId } },
        select: {
          isProfessional: true,
          profession: true,
          commissionPercentBps: true,
          customer: { select: { id: true, name: true } },
        },
      });
      if (!enrollment?.isProfessional) {
        throw new UnprocessableEntityException('Profissional indicador não encontrado nesta loja');
      }
      if (enrollment.commissionPercentBps <= 0) {
        throw new UnprocessableEntityException('Profissional indicador sem comissão configurada');
      }
      referrer = {
        id: enrollment.customer.id,
        name: enrollment.customer.name,
        profession: enrollment.profession,
        commissionPercentBps: enrollment.commissionPercentBps,
      };
    }
    const commissionCents = referrer ? Math.floor((amountCents * referrer.commissionPercentBps) / 10_000) : 0;

    const cashbackCents = calculateCashback(amountCents, store.cashbackPercentBps);
    const expiresAt = endOfDayInOffset(addDaysToDateString(purchaseDate, store.validityDays), offset);

    const result = await this.prisma.$transaction(
      async (tx) => {
        await this.cashback.lockCustomer(tx, customer.id);

        const sameDoc = await tx.purchase.findUnique({
          where: { storeId_fiscalDocument: { storeId, fiscalDocument: dto.fiscalDocument } },
          select: { id: true },
        });
        if (sameDoc) throw new ConflictException('Já existe cashback registrado para esta nota/cupom fiscal nesta loja');

        const sameDayAmount = await tx.purchase.findFirst({
          where: { storeId, customerId: customer.id, purchaseDate: new Date(purchaseDate), amountCents },
          select: { id: true },
        });
        if (sameDayAmount) {
          throw new ConflictException('Já existe compra deste cliente nesta data com o mesmo valor. Possível duplicidade.');
        }

        const purchase = await tx.purchase.create({
          data: {
            storeId,
            customerId: customer.id,
            cashierId: staff.id,
            referrerCustomerId: referrer?.id ?? null,
            fiscalDocument: dto.fiscalDocument,
            amountCents,
            cashbackCents,
            purchaseDate: new Date(purchaseDate),
          },
        });
        if (referrer && commissionCents > 0) {
          await tx.referralCommission.create({
            data: {
              purchaseId: purchase.id,
              storeId,
              professionalCustomerId: referrer.id,
              amountCents: commissionCents,
              percentBps: referrer.commissionPercentBps,
            },
          });
          await this.audit.log(
            {
              userId: staff.id,
              action: 'REFERRAL_COMMISSION_CREATED',
              entity: 'ReferralCommission',
              entityId: purchase.id,
              metadata: {
                storeId,
                purchaseId: purchase.id,
                professionalCustomerId: referrer.id,
                customerId: customer.id,
                amountCents,
                commissionCents,
                percentBps: referrer.commissionPercentBps,
              },
              ip,
            },
            tx,
          );
        }
        if (cashbackCents > 0) {
          await tx.cashbackCredit.create({
            data: {
              purchaseId: purchase.id,
              customerId: customer.id,
              storeId,
              amountCents: cashbackCents,
              remainingCents: cashbackCents,
              expiresAt,
            },
          });
        }
        const balanceCents = await this.cashback.balance(customer.id, storeId, tx);
        await this.audit.log(
          {
            userId: staff.id,
            action: 'PURCHASE_REGISTERED',
            entity: 'Purchase',
            entityId: purchase.id,
            metadata: { storeId, customerId: customer.id, amountCents, cashbackCents, fiscalDocument: dto.fiscalDocument, purchaseDate, balanceAfterCents: balanceCents },
            ip,
          },
          tx,
        );
        if (cashbackCents > 0) {
          await this.audit.log(
            {
              userId: staff.id,
              action: 'CASHBACK_CREDITED',
              entity: 'Customer',
              entityId: customer.id,
              metadata: { storeId, purchaseId: purchase.id, cashbackCents, percentBps: store.cashbackPercentBps, expiresAt: expiresAt.toISOString(), balanceAfterCents: balanceCents },
              ip,
            },
            tx,
          );
        }
        return { purchase, balanceCents };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 10_000 },
    );

    this.notifications.notifyPurchase({
      customerId: customer.id,
      customerName: customer.name,
      phone: customer.phone,
      email: customer.email,
      storeName: store.name,
      purchaseDate,
      amountCents,
      cashbackCents,
      balanceCents: result.balanceCents,
      expiresAt,
    });

    this.notifications.notifyStaff({
      storeId,
      subject: 'Nova compra registrada',
      summary: `Compra de ${formatBRL(amountCents)} registrada para ${customer.name}. Cashback: ${formatBRL(cashbackCents)}.${referrer ? ` Indicação de ${referrer.name}: comissão de ${formatBRL(commissionCents)}.` : ''}`,
    });
    this.telegram.notify('Compra registrada', `Valor: ${formatBRL(amountCents)} • Cashback: ${formatBRL(cashbackCents)} • Cliente: ${customer.name}${referrer ? ` • Indicação: ${referrer.name} (${formatBRL(commissionCents)})` : ''}`, { userName: staff.name, userRole: staff.role, storeName: store.name, ip });

    return {
      id: result.purchase.id,
      customer: { id: customer.id, name: customer.name },
      purchaseDate,
      fiscalDocument: dto.fiscalDocument,
      amountCents,
      cashbackCents,
      balanceCents: result.balanceCents,
      expiresAt,
      referral: referrer
        ? {
            professionalId: referrer.id,
            professionalName: referrer.name,
            profession: referrer.profession,
            percentBps: referrer.commissionPercentBps,
            commissionCents,
          }
        : null,
    };
  }

  async list(storeId: string | null, page: number, pageSize: number, search?: string, from?: string, to?: string) {
    const where: Prisma.PurchaseWhereInput = {
      ...(storeId ? { storeId } : {}),
      ...(from || to
        ? { purchaseDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
      ...(search
        ? {
            OR: [
              { fiscalDocument: { contains: search.toUpperCase() } },
              { customer: { name: { contains: search, mode: 'insensitive' } } },
              { customer: { phone: { contains: search.replace(/\D/g, '') || search } } },
            ],
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.purchase.count({ where }),
      this.prisma.purchase.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          cashier: { select: { id: true, name: true } },
          referrer: { select: { id: true, name: true } },
          commission: { select: { amountCents: true, percentBps: true, status: true } },
          credit: { select: { expiresAt: true, status: true, remainingCents: true } },
        },
      }),
    ]);
    return { total, page, pageSize, items };
  }
}
