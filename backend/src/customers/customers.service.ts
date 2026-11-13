import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ActivationService } from '../auth/activation.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TelegramService } from '../notifications/telegram.service';
import { CashbackService } from '../cashback/cashback.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/types';
import { formatBRL } from '../common/utils/money';
import { normalizePhone } from '../common/utils/phone';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto, UpdateProfessionalDto } from './dto';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger('Customers');

  constructor(
    private readonly prisma: PrismaService,
    private readonly cashback: CashbackService,
    private readonly audit: AuditService,
    private readonly activation: ActivationService,
    private readonly notifications: NotificationsService,
    private readonly telegram: TelegramService,
  ) {}

  requirePhone(raw: string): string {
    const phone = normalizePhone(raw);
    if (!phone) throw new BadRequestException('Telefone inválido. Informe DDD + número.');
    return phone;
  }

  openRedemptionRequests(storeId: string) {
    return this.prisma.redemptionRequest.findMany({
      where: { storeId, status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, createdAt: true, customer: { select: { id: true, name: true, phone: true } } },
    });
  }

  async lookup(rawPhone: string, staff: AuthUser) {
    const storeId = staff.storeId!;
    const phone = this.requirePhone(rawPhone);
    const customer = await this.prisma.customer.findUnique({
      where: { phone },
      include: {
        enrollments: {
          where: { storeId },
          select: { enrolledAt: true, isProfessional: true, profession: true, commissionPercentBps: true },
        },
      },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado. Peça para o cliente se cadastrar.');

    const store = await this.prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { id: true, name: true, cashbackPercentBps: true, validityDays: true, maxRedeemPercentBps: true },
    });
    const credits = await this.cashback.activeCredits(customer.id, storeId);
    const balanceCents = credits.reduce((acc, c) => acc + c.remainingCents, 0);
    const enrollment = customer.enrollments[0];

    return {
      customer: { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email },
      enrolled: customer.enrollments.length > 0,
      professional: {
        isProfessional: enrollment?.isProfessional ?? false,
        profession: enrollment?.profession ?? null,
        commissionPercentBps: enrollment?.commissionPercentBps ?? 0,
      },
      store,
      balanceCents,
      credits,
    };
  }

  async createAtCounter(dto: CreateCustomerDto, staff: AuthUser, ip?: string) {
    const storeId = staff.storeId!;
    const phone = this.requirePhone(dto.phone);
    const store = await this.prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { id: true, groupId: true, signupBonusCents: true, validityDays: true },
    });
    const existing = await this.prisma.customer.findUnique({
      where: { phone },
      include: { enrollments: { select: { storeId: true, store: { select: { groupId: true } } } } },
    });

    if (existing) {
      if (existing.enrollments.some((e) => e.storeId === storeId)) {
        throw new ConflictException('Este cliente já está cadastrado nesta loja.');
      }
      if (!existing.enrollments.some((e) => e.store.groupId === store.groupId)) {
        throw new ConflictException('Já existe um cliente com este telefone em outra rede e ele não pode ser vinculado a esta loja. Peça para o cliente entrar em contato com o suporte.');
      }
      const bonusCents = await this.prisma.$transaction(async (tx) => {
        await tx.customerStore.create({ data: { customerId: existing.id, storeId } });
        const granted = await this.cashback.grantSignupBonus(tx, {
          customerId: existing.id,
          storeId,
          signupBonusCents: store.signupBonusCents,
          validityDays: store.validityDays,
          actor: { userId: staff.id, role: staff.role },
          ip,
        });
        await this.audit.log({ userId: staff.id, action: 'CUSTOMER_ENROLLED', entity: 'Customer', entityId: existing.id, metadata: { storeId, bonusCents: granted }, ip }, tx);
        return granted;
      });
      return {
        id: existing.id,
        name: existing.name,
        phone: existing.phone,
        email: existing.email,
        alreadyRegistered: true,
        bonusCents,
        message: 'Este cliente já estava cadastrado anteriormente em outra loja do grupo e foi vinculado a esta loja.',
      };
    }

    const [emailCustomer, emailUser] = await Promise.all([
      this.prisma.customer.findUnique({ where: { email: dto.email }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } }),
    ]);
    if (emailCustomer || emailUser) throw new ConflictException('Já existe um cliente com este e-mail cadastrado com outro telefone.');

    const { customer, bonusCents } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: { name: dto.name, phone, rg: dto.rg, email: dto.email, enrollments: { create: { storeId } } },
      });
      const granted = await this.cashback.grantSignupBonus(tx, {
        customerId: created.id,
        storeId,
        signupBonusCents: store.signupBonusCents,
        validityDays: store.validityDays,
        actor: { userId: staff.id, role: staff.role },
        ip,
      });
      await this.audit.log({ userId: staff.id, action: 'CUSTOMER_CREATED_AT_COUNTER', entity: 'Customer', entityId: created.id, metadata: { storeId, bonusCents: granted }, ip }, tx);
      return { customer: created, bonusCents: granted };
    });
    this.telegram.notify('Cliente cadastrado no caixa', `Cliente: ${customer.name} • Tel: ${customer.phone}${bonusCents ? ` • Bônus: ${formatBRL(bonusCents)}` : ''}`, { userName: staff.name, userRole: staff.role, ip });
    await this.sendWelcome(customer, storeId);
    return { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email, alreadyRegistered: false, bonusCents };
  }

  private async sendWelcome(customer: { id: string; name: string; phone: string; email: string }, storeId: string) {
    try {
      const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { name: true } });
      const activationUrl = await this.activation.issueLink(customer.id);
      this.notifications.notifyWelcome({
        customerId: customer.id,
        customerName: customer.name,
        phone: customer.phone,
        email: customer.email,
        storeName: store.name,
        activationUrl,
      });
    } catch (err) {
      this.logger.error(`Falha ao preparar boas-vindas do cliente ${customer.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async resendWelcome(customerId: string, staff: AuthUser, ip?: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, enrollments: { some: { storeId: staff.storeId! } } },
      select: { id: true, name: true, phone: true, email: true, userId: true },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado nesta loja');
    if (customer.userId) throw new ConflictException('Este cliente já ativou o acesso.');
    await this.sendWelcome(customer, staff.storeId!);
    await this.audit.log({ userId: staff.id, action: 'CUSTOMER_WELCOME_RESENT', entity: 'Customer', entityId: customer.id, ip });
    return { sent: true };
  }

  async enroll(customerId: string, staff: AuthUser, ip?: string) {
    const storeId = staff.storeId!;
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    const store = await this.prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { signupBonusCents: true, validityDays: true },
    });
    const bonusCents = await this.prisma.$transaction(async (tx) => {
      const created = await tx.customerStore.createMany({
        data: [{ customerId, storeId }],
        skipDuplicates: true,
      });
      if (!created.count) return 0;
      const granted = await this.cashback.grantSignupBonus(tx, {
        customerId,
        storeId,
        signupBonusCents: store.signupBonusCents,
        validityDays: store.validityDays,
        actor: { userId: staff.id, role: staff.role },
        ip,
      });
      await this.audit.log({ userId: staff.id, action: 'CUSTOMER_ENROLLED', entity: 'Customer', entityId: customerId, metadata: { storeId, bonusCents: granted }, ip }, tx);
      return granted;
    });
    return { enrolled: true, bonusCents };
  }

  async listForStore(storeId: string | null, search: string | undefined, page: number, pageSize: number) {
    const where = {
      enrollments: { some: storeId ? { storeId } : {} },
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { phone: { contains: search.replace(/\D/g, '') || search } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          createdAt: true,
          userId: true,
          enrollments: {
            where: storeId ? { storeId } : {},
            select: { isProfessional: true, profession: true, commissionPercentBps: true },
            take: 1,
          },
        },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      items: items.map(({ userId, enrollments, ...c }) => ({
        ...c,
        hasAccount: userId !== null,
        isProfessional: enrollments[0]?.isProfessional ?? false,
        profession: enrollments[0]?.profession ?? null,
        commissionPercentBps: enrollments[0]?.commissionPercentBps ?? 0,
      })),
    };
  }

  async professionals(storeId: string, search: string | undefined) {
    const rows = await this.prisma.customerStore.findMany({
      where: {
        storeId,
        isProfessional: true,
        ...(search
          ? {
              customer: {
                OR: [
                  { name: { contains: search, mode: 'insensitive' as const } },
                  { phone: { contains: search.replace(/\D/g, '') || search } },
                ],
              },
            }
          : {}),
      },
      orderBy: { customer: { name: 'asc' } },
      take: 100,
      select: {
        profession: true,
        commissionPercentBps: true,
        customer: { select: { id: true, name: true, phone: true } },
      },
    });
    return rows.map((r) => ({
      id: r.customer.id,
      name: r.customer.name,
      phone: r.customer.phone,
      profession: r.profession,
      commissionPercentBps: r.commissionPercentBps,
    }));
  }

  async setProfessional(customerId: string, dto: UpdateProfessionalDto, staff: AuthUser, ip?: string) {
    const storeId = staff.storeId!;
    const enrollment = await this.prisma.customerStore.findUnique({
      where: { customerId_storeId: { customerId, storeId } },
      select: { customerId: true, isProfessional: true, profession: true, commissionPercentBps: true },
    });
    if (!enrollment) throw new NotFoundException('Cliente não está vinculado a esta loja');
    if (dto.isProfessional && !dto.profession?.trim()) {
      throw new BadRequestException('Informe a profissão do profissional');
    }
    const commissionPercentBps = dto.isProfessional ? Math.round((dto.commissionPercent ?? 0) * 100) : 0;
    if (dto.isProfessional && commissionPercentBps <= 0) {
      throw new BadRequestException('Informe uma comissão maior que zero para o profissional');
    }
    const updated = await this.prisma.customerStore.update({
      where: { customerId_storeId: { customerId, storeId } },
      data: {
        isProfessional: dto.isProfessional,
        profession: dto.isProfessional ? dto.profession!.trim() : null,
        commissionPercentBps,
      },
      select: { isProfessional: true, profession: true, commissionPercentBps: true },
    });
    await this.audit.log(
      {
        userId: staff.id,
        action: dto.isProfessional ? 'CUSTOMER_PROFESSIONAL_ENABLED' : 'CUSTOMER_PROFESSIONAL_DISABLED',
        entity: 'Customer',
        entityId: customerId,
        metadata: { storeId, before: enrollment, after: updated },
        ip,
      },
    );
    return updated;
  }
}
