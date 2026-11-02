import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ActivationService } from '../auth/activation.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CashbackService } from '../cashback/cashback.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/types';
import { normalizePhone } from '../common/utils/phone';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger('Customers');

  constructor(
    private readonly prisma: PrismaService,
    private readonly cashback: CashbackService,
    private readonly audit: AuditService,
    private readonly activation: ActivationService,
    private readonly notifications: NotificationsService,
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
      include: { enrollments: { where: { storeId }, select: { enrolledAt: true } } },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado. Peça para o cliente se cadastrar.');

    const store = await this.prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { id: true, name: true, cashbackPercentBps: true, validityDays: true, maxRedeemPercentBps: true },
    });
    const credits = await this.cashback.activeCredits(customer.id, storeId);
    const balanceCents = credits.reduce((acc, c) => acc + c.remainingCents, 0);

    return {
      customer: { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email },
      enrolled: customer.enrollments.length > 0,
      store,
      balanceCents,
      credits,
    };
  }

  async createAtCounter(dto: CreateCustomerDto, staff: AuthUser, ip?: string) {
    const storeId = staff.storeId!;
    const phone = this.requirePhone(dto.phone);
    const existing = await this.prisma.customer.findUnique({
      where: { phone },
      include: { enrollments: { select: { storeId: true, store: { select: { groupId: true } } } } },
    });

    if (existing) {
      if (existing.enrollments.some((e) => e.storeId === storeId)) {
        throw new ConflictException('Este cliente já está cadastrado nesta loja.');
      }
      const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { groupId: true } });
      if (!existing.enrollments.some((e) => e.store.groupId === store.groupId)) {
        throw new ConflictException('Já existe um cliente com este telefone em outra rede e ele não pode ser vinculado a esta loja. Peça para o cliente entrar em contato com o suporte.');
      }
      await this.prisma.customerStore.create({ data: { customerId: existing.id, storeId } });
      await this.audit.log({ userId: staff.id, action: 'CUSTOMER_ENROLLED', entity: 'Customer', entityId: existing.id, ip });
      return {
        id: existing.id,
        name: existing.name,
        phone: existing.phone,
        email: existing.email,
        alreadyRegistered: true,
        message: 'Este cliente já estava cadastrado anteriormente em outra loja do grupo e foi vinculado a esta loja.',
      };
    }

    const [emailCustomer, emailUser] = await Promise.all([
      this.prisma.customer.findUnique({ where: { email: dto.email }, select: { id: true } }),
      this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } }),
    ]);
    if (emailCustomer || emailUser) throw new ConflictException('Já existe um cliente com este e-mail cadastrado com outro telefone.');

    const customer = await this.prisma.customer.create({
      data: { name: dto.name, phone, rg: dto.rg, email: dto.email, enrollments: { create: { storeId } } },
    });
    await this.audit.log({ userId: staff.id, action: 'CUSTOMER_CREATED_AT_COUNTER', entity: 'Customer', entityId: customer.id, ip });
    await this.sendWelcome(customer, storeId);
    return { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email, alreadyRegistered: false };
  }

  private async sendWelcome(customer: { id: string; name: string; phone: string }, storeId: string) {
    try {
      const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { name: true } });
      const activationUrl = await this.activation.issueLink(customer.id);
      this.notifications.notifyWelcome({
        customerId: customer.id,
        customerName: customer.name,
        phone: customer.phone,
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
      select: { id: true, name: true, phone: true, userId: true },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado nesta loja');
    if (customer.userId) throw new ConflictException('Este cliente já ativou o acesso.');
    await this.sendWelcome(customer, staff.storeId!);
    await this.audit.log({ userId: staff.id, action: 'CUSTOMER_WELCOME_RESENT', entity: 'Customer', entityId: customer.id, ip });
    return { sent: true };
  }

  async enroll(customerId: string, staff: AuthUser, ip?: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    await this.prisma.customerStore.upsert({
      where: { customerId_storeId: { customerId, storeId: staff.storeId! } },
      update: {},
      create: { customerId, storeId: staff.storeId! },
    });
    await this.audit.log({ userId: staff.id, action: 'CUSTOMER_ENROLLED', entity: 'Customer', entityId: customerId, ip });
    return { enrolled: true };
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
        select: { id: true, name: true, phone: true, email: true, createdAt: true, userId: true },
      }),
    ]);
    return { total, page, pageSize, items: items.map(({ userId, ...c }) => ({ ...c, hasAccount: userId !== null })) };
  }
}
