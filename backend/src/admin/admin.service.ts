import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, RedemptionStatus, Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { TelegramService } from '../notifications/telegram.service';
import { AuthUser } from '../common/types';
import { endOfDayInOffset } from '../common/utils/dates';
import { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsQuery, CreateGroupDto, CreateStoreDto, UpdateGroupDto, UpdateStoreDto } from './dto';

const pctToBps = (v: number | undefined) => (v === undefined ? undefined : Math.round(v * 100));

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
    private readonly telegram: TelegramService,
  ) {}

  listGroups() {
    return this.prisma.group.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { stores: true } } },
    });
  }

  async createGroup(dto: CreateGroupDto, actor: AuthUser, ip?: string) {
    const exists = await this.prisma.group.findUnique({ where: { slug: dto.slug }, select: { id: true } });
    if (exists) throw new ConflictException('Já existe um grupo com este identificador');
    const group = await this.prisma.group.create({ data: { name: dto.name, slug: dto.slug } });
    await this.audit.log({ userId: actor.id, action: 'GROUP_CREATED', entity: 'Group', entityId: group.id, metadata: { name: group.name, slug: group.slug }, ip });
    this.telegram.notify('Grupo criado', `${group.name} (${group.slug})`, { userName: actor.name, userRole: actor.role });
    return group;
  }

  async updateGroup(id: string, dto: UpdateGroupDto, actor: AuthUser, ip?: string) {
    const before = await this.prisma.group.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Grupo não encontrado');
    const group = await this.prisma.group.update({ where: { id }, data: { name: dto.name, active: dto.active } });
    await this.audit.log({ userId: actor.id, action: 'GROUP_UPDATED', entity: 'Group', entityId: id, metadata: { changes: dto, before } as unknown as Prisma.InputJsonValue, ip });
    return group;
  }

  async deleteGroup(id: string, actor: AuthUser, ip?: string) {
    const stores = await this.prisma.store.count({ where: { groupId: id } });
    if (stores > 0) throw new ConflictException('Remova ou transfira as lojas do grupo antes de excluí-lo');
    const deleted = await this.prisma.group.delete({ where: { id } });
    await this.audit.log({ userId: actor.id, action: 'GROUP_DELETED', entity: 'Group', entityId: id, metadata: { name: deleted.name, slug: deleted.slug }, ip });
    this.telegram.notify('Grupo excluído', `${deleted.name} (${deleted.slug})`, { userName: actor.name, userRole: actor.role });
  }

  async listStores(groupId: string | undefined, search: string | undefined, page: number, pageSize: number) {
    const where: Prisma.StoreWhereInput = {
      ...(groupId ? { groupId } : {}),
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.store.count({ where }),
      this.prisma.store.findMany({
        where,
        orderBy: [{ group: { name: 'asc' } }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          group: { select: { id: true, name: true } },
          _count: { select: { users: true, enrollments: true, purchases: true } },
        },
      }),
    ]);
    return { total, page, pageSize, items };
  }

  async createStore(dto: CreateStoreDto, actor: AuthUser, ip?: string) {
    const group = await this.prisma.group.findUnique({ where: { id: dto.groupId }, select: { id: true } });
    if (!group) throw new NotFoundException('Grupo não encontrado');
    const store = await this.prisma.store.create({
      data: {
        groupId: dto.groupId,
        name: dto.name,
        segment: dto.segment,
        cnpj: dto.cnpj || null,
        cashbackPercentBps: pctToBps(dto.cashbackPercent)!,
        validityDays: dto.validityDays,
        maxRedeemPercentBps: pctToBps(dto.maxRedeemPercent) ?? 10_000,
      },
    });
    await this.audit.log({ userId: actor.id, action: 'STORE_CREATED', entity: 'Store', entityId: store.id, metadata: { ...store } as unknown as Prisma.InputJsonValue, ip });
    this.telegram.notify('Loja criada', `${store.name} • Segmento: ${store.segment}`, { userName: actor.name, userRole: actor.role });
    return store;
  }

  async updateStore(id: string, dto: UpdateStoreDto, actor: AuthUser, ip?: string) {
    const before = await this.prisma.store.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Loja não encontrada');
    if (dto.groupId) {
      const group = await this.prisma.group.findUnique({ where: { id: dto.groupId }, select: { id: true } });
      if (!group) throw new NotFoundException('Grupo não encontrado');
    }
    const store = await this.prisma.store.update({
      where: { id },
      data: {
        groupId: dto.groupId,
        name: dto.name,
        segment: dto.segment,
        cnpj: dto.cnpj,
        cashbackPercentBps: pctToBps(dto.cashbackPercent),
        validityDays: dto.validityDays,
        maxRedeemPercentBps: pctToBps(dto.maxRedeemPercent),
        active: dto.active,
      },
    });
    await this.audit.log({
      userId: actor.id,
      action: 'STORE_UPDATED',
      entity: 'Store',
      entityId: id,
      metadata: { changes: dto, before } as unknown as Prisma.InputJsonValue,
      ip,
    });
    return store;
  }

  async deleteStore(id: string, actor: AuthUser, ip?: string) {
    const store = await this.prisma.store.findUnique({
      where: { id },
      include: { _count: { select: { purchases: true, redemptions: true } } },
    });
    if (!store) throw new NotFoundException('Loja não encontrada');
    if (store._count.purchases > 0 || store._count.redemptions > 0) {
      throw new ConflictException(
        'A loja possui histórico de compras/resgates e não pode ser excluída. Desative-a para preservar o histórico.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const staff = await tx.user.findMany({ where: { storeId: id }, select: { id: true } });
      await tx.refreshToken.deleteMany({ where: { userId: { in: staff.map((s) => s.id) } } });
      await tx.user.updateMany({ where: { storeId: id }, data: { storeId: null, active: false, passwordChangedAt: new Date() } });
      await tx.store.delete({ where: { id } });
      await this.audit.log({ userId: actor.id, action: 'STORE_DELETED', entity: 'Store', entityId: id, metadata: { name: store.name }, ip }, tx);
    });
  }

  async dashboard() {
    const [groups, stores, staff, customers, purchases, redeemed, pending] = await Promise.all([
      this.prisma.group.count(),
      this.prisma.store.count({ where: { active: true } }),
      this.prisma.user.count({ where: { role: { not: Role.CUSTOMER }, active: true } }),
      this.prisma.customer.count(),
      this.prisma.purchase.aggregate({ _sum: { amountCents: true, cashbackCents: true }, _count: true }),
      this.prisma.redemption.aggregate({ where: { status: RedemptionStatus.APPROVED }, _sum: { discountCents: true } }),
      this.prisma.redemption.count({ where: { status: RedemptionStatus.PENDING } }),
    ]);
    return {
      groups,
      stores,
      staff,
      customers,
      purchasesCount: purchases._count,
      salesCents: purchases._sum.amountCents ?? 0,
      cashbackIssuedCents: purchases._sum.cashbackCents ?? 0,
      cashbackRedeemedCents: redeemed._sum.discountCents ?? 0,
      pendingRedemptions: pending,
    };
  }

  async auditLogs(q: AuditLogsQuery) {
    const and: Prisma.AuditLogWhereInput[] = [];
    if (q.kind !== 'all') and.push(q.kind === 'http' ? { action: { startsWith: 'HTTP_' } } : { NOT: { action: { startsWith: 'HTTP_' } } });
    if (q.userId) and.push({ userId: q.userId });
    if (q.storeId) and.push({ storeId: q.storeId });
    if (q.outcome) and.push({ outcome: q.outcome });
    if (q.action) and.push({ action: q.action });
    if (q.entityId) and.push({ OR: [{ entityId: q.entityId }, { metadata: { path: ['customerId'], equals: q.entityId } }] });
    if (q.from || q.to) {
      const offset = this.config.get('BUSINESS_UTC_OFFSET', { infer: true });
      and.push({
        createdAt: {
          ...(q.from ? { gte: new Date(`${q.from}T00:00:00.000${offset}`) } : {}),
          ...(q.to ? { lte: endOfDayInOffset(q.to, offset) } : {}),
        },
      });
    }
    if (q.search) {
      and.push({
        OR: [
          { action: { contains: q.search.toUpperCase() } },
          { entity: { contains: q.search, mode: 'insensitive' } },
          { path: { contains: q.search, mode: 'insensitive' } },
          { error: { contains: q.search, mode: 'insensitive' } },
          { ip: { contains: q.search } },
          { user: { is: { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] } } },
        ],
      });
    }
    const where: Prisma.AuditLogWhereInput = { AND: and };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { user: { select: { name: true, email: true } } },
      }),
    ]);
    return { total, page: q.page, pageSize: q.pageSize, items };
  }

  async auditActions() {
    const rows = await this.prisma.auditLog.groupBy({ by: ['action'], orderBy: { action: 'asc' } });
    return rows.map((r) => r.action);
  }
}
