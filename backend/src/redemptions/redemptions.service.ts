import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CreditStatus, Prisma, RedemptionStatus, Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { allocateRedemption, InsufficientBalanceError, maxRedeemable } from '../cashback/cashback.calculator';
import { CashbackService } from '../cashback/cashback.service';
import { AuthUser, RequestContext } from '../common/types';
import { formatBRL, toCents } from '../common/utils/money';
import { maskPhone, normalizePhone } from '../common/utils/phone';
import { NotificationsService } from '../notifications/notifications.service';
import { TelegramService } from '../notifications/telegram.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApproveWithCredentialsDto, CreateRedemptionDto } from './dto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function authorizationCode(): string {
  const bytes = randomBytes(10);
  let code = '';
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `AUT-${code}`;
}

const listInclude = {
  customer: { select: { id: true, name: true, phone: true, email: true } },
  cashier: { select: { id: true, name: true } },
  manager: { select: { id: true, name: true } },
} satisfies Prisma.RedemptionInclude;

@Injectable()
export class RedemptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cashback: CashbackService,
    private readonly auth: AuthService,
    private readonly notifications: NotificationsService,
    private readonly telegram: TelegramService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateRedemptionDto, staff: AuthUser, ip?: string) {
    const storeId = staff.storeId!;
    const phone = normalizePhone(dto.phone);
    if (!phone) throw new BadRequestException('Telefone inválido');

    const purchaseAmountCents = toCents(dto.purchaseAmount);
    const discountCents = toCents(dto.discount);
    if (discountCents > purchaseAmountCents) {
      throw new BadRequestException('O desconto não pode ser maior que o valor da compra');
    }

    const customer = await this.prisma.customer.findUnique({
      where: { phone },
      include: { enrollments: { where: { storeId } } },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    if (!customer.enrollments.length) throw new UnprocessableEntityException('Cliente não está cadastrado nesta loja');

    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId } });

    return this.prisma.$transaction(async (tx) => {
      await this.cashback.lockCustomer(tx, customer.id);

      const pending = await tx.redemption.findFirst({
        where: { storeId, customerId: customer.id, status: RedemptionStatus.PENDING },
        select: { id: true },
      });
      if (pending) throw new ConflictException('Este cliente já possui uma solicitação de desconto aguardando aprovação');

      const sameDoc = await tx.redemption.findFirst({
        where: {
          storeId,
          fiscalDocument: dto.fiscalDocument,
          status: { in: [RedemptionStatus.PENDING, RedemptionStatus.APPROVED] },
        },
        select: { id: true },
      });
      if (sameDoc) throw new ConflictException('Já existe desconto de cashback para esta nota/cupom fiscal');

      const balanceCents = await this.cashback.balance(customer.id, storeId, tx);
      const max = maxRedeemable(balanceCents, purchaseAmountCents, store.maxRedeemPercentBps);
      if (discountCents > max) {
        throw new UnprocessableEntityException(`Desconto acima do permitido. Máximo disponível: ${formatBRL(max)}`);
      }

      const redemption = await tx.redemption.create({
        data: {
          storeId,
          customerId: customer.id,
          cashierId: staff.id,
          fiscalDocument: dto.fiscalDocument,
          purchaseAmountCents,
          discountCents,
        },
        include: listInclude,
      });
      await tx.redemptionRequest.updateMany({
        where: { storeId, customerId: customer.id, status: 'OPEN' },
        data: { status: 'ATTENDED' },
      });
      await this.audit.log(
        { userId: staff.id, action: 'REDEMPTION_REQUESTED', entity: 'Redemption', entityId: redemption.id, metadata: { storeId, customerId: customer.id, fiscalDocument: dto.fiscalDocument, purchaseAmountCents, discountCents, balanceCents, maxRedeemableCents: max }, ip },
        tx,
      );
      return redemption;
    });
  }

  async list(staff: AuthUser, status: RedemptionStatus | undefined, page: number, pageSize: number) {
    const where: Prisma.RedemptionWhereInput = { ...(staff.storeId ? { storeId: staff.storeId } : {}), ...(status ? { status } : {}) };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.redemption.count({ where }),
      this.prisma.redemption.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: listInclude,
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async findForStaff(id: string, staff: AuthUser) {
    const redemption = await this.prisma.redemption.findUnique({ where: { id }, include: listInclude });
    if (!redemption || (staff.role !== Role.ROOT && redemption.storeId !== staff.storeId)) throw new NotFoundException('Solicitação não encontrada');
    return redemption;
  }

  async approve(id: string, manager: AuthUser, note: string | undefined, ctx: RequestContext, via = 'MANAGER_SESSION') {
    if (manager.role !== Role.MANAGER) throw new ForbiddenException('Apenas gerentes podem aprovar descontos');
    const base = await this.findForStaff(id, manager);
    if (base.status !== RedemptionStatus.PENDING) throw new ConflictException('Esta solicitação já foi decidida');

    const result = await this.prisma.$transaction(
      async (tx) => {
        await this.cashback.lockCustomer(tx, base.customerId);
        const current = await tx.redemption.findUniqueOrThrow({ where: { id } });
        if (current.status !== RedemptionStatus.PENDING) throw new ConflictException('Esta solicitação já foi decidida');

        const credits = await this.cashback.activeCredits(current.customerId, current.storeId, tx);
        let allocations;
        try {
          allocations = allocateRedemption(credits, current.discountCents);
        } catch (err) {
          if (err instanceof InsufficientBalanceError) {
            throw new UnprocessableEntityException(
              `Saldo insuficiente no momento da aprovação. Disponível: ${formatBRL(err.available)}`,
            );
          }
          throw err;
        }

        for (const a of allocations) {
          const credit = credits.find((c) => c.id === a.creditId)!;
          const remaining = credit.remainingCents - a.amountCents;
          await tx.cashbackCredit.update({
            where: { id: a.creditId },
            data: { remainingCents: remaining, status: remaining === 0 ? CreditStatus.CONSUMED : CreditStatus.ACTIVE },
          });
        }
        await tx.redemptionItem.createMany({
          data: allocations.map((a) => ({ redemptionId: id, creditId: a.creditId, amountCents: a.amountCents })),
        });

        const updated = await tx.redemption.update({
          where: { id },
          data: {
            status: RedemptionStatus.APPROVED,
            managerId: manager.id,
            decidedAt: new Date(),
            decisionNote: note,
            authorizationCode: authorizationCode(),
          },
          include: { ...listInclude, store: { select: { name: true } } },
        });
        const balanceCents = await this.cashback.balance(current.customerId, current.storeId, tx);
        const balanceBeforeCents = credits.reduce((acc, c) => acc + c.remainingCents, 0);
        await this.audit.log(
          {
            userId: manager.id,
            action: 'REDEMPTION_APPROVED',
            entity: 'Redemption',
            entityId: id,
            metadata: {
              storeId: current.storeId,
              customerId: current.customerId,
              cashierId: current.cashierId,
              fiscalDocument: current.fiscalDocument,
              purchaseAmountCents: current.purchaseAmountCents,
              discountCents: current.discountCents,
              via,
              authorizationCode: updated.authorizationCode,
              balanceBeforeCents,
              balanceAfterCents: balanceCents,
              allocations: allocations.map((a) => ({ creditId: a.creditId, amountCents: a.amountCents })),
            },
            ip: ctx.ip,
          },
          tx,
        );
        return { updated, balanceCents };
      },
      { timeout: 10_000 },
    );

    this.notifications.notifyRedemption({
      customerId: result.updated.customerId,
      customerName: result.updated.customer.name,
      phone: result.updated.customer.phone,
      email: result.updated.customer.email,
      storeName: result.updated.store.name,
      discountCents: result.updated.discountCents,
      balanceCents: result.balanceCents,
      authorizationCode: result.updated.authorizationCode!,
      decidedAt: result.updated.decidedAt!,
    });

    this.notifications.notifyStaff({
      storeId: result.updated.storeId,
      subject: 'Resgate de cashback aprovado',
      summary: `Resgate de ${formatBRL(result.updated.discountCents)} aprovado para ${result.updated.customer.name}. Autorização: ${result.updated.authorizationCode}.`,
    });
    this.telegram.notify('Resgate aprovado', `Desconto: ${formatBRL(result.updated.discountCents)} • Cliente: ${result.updated.customer.name} • Auth: ${result.updated.authorizationCode}`, { userName: manager.name, userRole: manager.role, storeName: result.updated.store.name, ip: ctx.ip });

    return this.receipt(id, manager);
  }

  async approveWithCredentials(id: string, cashier: AuthUser, dto: ApproveWithCredentialsDto, ctx: RequestContext) {
    const manager = await this.auth.verifyCredentials(dto.email, dto.password, ctx);
    if (manager.role !== Role.MANAGER || manager.storeId !== cashier.storeId) {
      await this.audit.log({
        userId: cashier.id,
        action: 'REDEMPTION_APPROVAL_DENIED',
        entity: 'Redemption',
        entityId: id,
        outcome: 'DENIED',
        error: 'Credenciais informadas não pertencem a um gerente desta loja',
        metadata: { attemptedBy: manager.id, attemptedRole: manager.role },
        ip: ctx.ip,
      });
      throw new ForbiddenException('As credenciais informadas não pertencem a um gerente desta loja');
    }
    return this.approve(
      id,
      { id: manager.id, role: manager.role, storeId: manager.storeId, name: manager.name, email: manager.email },
      dto.note,
      ctx,
      `CASHIER_TERMINAL:${cashier.id}`,
    );
  }

  async reject(id: string, manager: AuthUser, note: string | undefined, ctx: RequestContext) {
    const base = await this.findForStaff(id, manager);
    const updated = await this.prisma.redemption.updateMany({
      where: { id: base.id, status: RedemptionStatus.PENDING },
      data: { status: RedemptionStatus.REJECTED, managerId: manager.id, decidedAt: new Date(), decisionNote: note },
    });
    if (updated.count !== 1) throw new ConflictException('Esta solicitação já foi decidida');
    await this.audit.log({ userId: manager.id, action: 'REDEMPTION_REJECTED', entity: 'Redemption', entityId: id, metadata: { storeId: base.storeId, customerId: base.customerId, discountCents: base.discountCents, note }, ip: ctx.ip });
    this.notifications.notifyStaff({
      storeId: base.storeId,
      subject: 'Resgate de cashback rejeitado',
      summary: `Resgate de ${formatBRL(base.discountCents)} rejeitado${note ? ` (${note})` : ''}.`,
    });
    this.telegram.notify('Resgate rejeitado', `Desconto: ${formatBRL(base.discountCents)}${note ? ` • Motivo: ${note}` : ''}`, { userName: manager.name, userRole: manager.role, ip: ctx.ip });
    return this.findForStaff(id, manager);
  }

  async cancel(id: string, staff: AuthUser, ctx: RequestContext) {
    const base = await this.findForStaff(id, staff);
    if (staff.role === Role.CASHIER && base.cashierId !== staff.id) {
      throw new ForbiddenException('Apenas quem criou a solicitação pode cancelá-la');
    }
    const updated = await this.prisma.redemption.updateMany({
      where: { id: base.id, status: RedemptionStatus.PENDING },
      data: { status: RedemptionStatus.CANCELLED, decidedAt: new Date() },
    });
    if (updated.count !== 1) throw new ConflictException('Esta solicitação já foi decidida');
    await this.audit.log({ userId: staff.id, action: 'REDEMPTION_CANCELLED', entity: 'Redemption', entityId: id, metadata: { storeId: base.storeId, customerId: base.customerId, discountCents: base.discountCents }, ip: ctx.ip });
    this.telegram.notify('Resgate cancelado', `Desconto: ${formatBRL(base.discountCents)}`, { userName: staff.name, userRole: staff.role, ip: ctx.ip });
    return this.findForStaff(id, staff);
  }

  async receipt(id: string, user: AuthUser) {
    const r = await this.prisma.redemption.findUnique({
      where: { id },
      include: {
        store: { select: { id: true, name: true, cnpj: true, segment: true, group: { select: { name: true } } } },
        customer: { select: { id: true, name: true, phone: true, email: true, userId: true } },
        cashier: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true, email: true } },
      },
    });
    const allowed =
      r &&
      (user.role === Role.ROOT ||
        ((user.role === Role.MANAGER || user.role === Role.CASHIER) && r.storeId === user.storeId) ||
        (user.role === Role.CUSTOMER && r.customer.userId === user.id));
    if (!r || !allowed) throw new NotFoundException('Comprovante não encontrado');
    if (r.status !== RedemptionStatus.APPROVED) throw new UnprocessableEntityException('Desconto ainda não aprovado');

    return {
      id: r.id,
      authorizationCode: r.authorizationCode,
      status: r.status,
      approvedAt: r.decidedAt,
      requestedAt: r.createdAt,
      fiscalDocument: r.fiscalDocument,
      purchaseAmountCents: r.purchaseAmountCents,
      discountCents: r.discountCents,
      amountDueCents: r.purchaseAmountCents - r.discountCents,
      note: r.decisionNote,
      store: { name: r.store.name, cnpj: r.store.cnpj, segment: r.store.segment, group: r.store.group.name },
      customer: { name: r.customer.name, phone: maskPhone(r.customer.phone) },
      cashier: { id: r.cashier.id, name: r.cashier.name },
      manager: r.manager ? { id: r.manager.id, name: r.manager.name, email: r.manager.email } : null,
    };
  }
}
