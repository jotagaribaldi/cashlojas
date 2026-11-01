import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RedemptionStatus, Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGroupDto, CreateStoreDto, UpdateGroupDto, UpdateStoreDto } from './dto';

const pctToBps = (v: number | undefined) => (v === undefined ? undefined : Math.round(v * 100));

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
    await this.audit.log({ userId: actor.id, action: 'GROUP_CREATED', entity: 'Group', entityId: group.id, ip });
    return group;
  }

  async updateGroup(id: string, dto: UpdateGroupDto, actor: AuthUser, ip?: string) {
    const group = await this.prisma.group.update({ where: { id }, data: { name: dto.name, active: dto.active } });
    await this.audit.log({ userId: actor.id, action: 'GROUP_UPDATED', entity: 'Group', entityId: id, ip });
    return group;
  }

  async deleteGroup(id: string, actor: AuthUser, ip?: string) {
    const stores = await this.prisma.store.count({ where: { groupId: id } });
    if (stores > 0) throw new ConflictException('Remova ou transfira as lojas do grupo antes de excluí-lo');
    await this.prisma.group.delete({ where: { id } });
    await this.audit.log({ userId: actor.id, action: 'GROUP_DELETED', entity: 'Group', entityId: id, ip });
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
    await this.audit.log({ userId: actor.id, action: 'STORE_CREATED', entity: 'Store', entityId: store.id, ip });
    return store;
  }

  async updateStore(id: string, dto: UpdateStoreDto, actor: AuthUser, ip?: string) {
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
      metadata: dto as unknown as Prisma.InputJsonValue,
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

  async auditLogs(page: number, pageSize: number, search?: string) {
    const where: Prisma.AuditLogWhereInput = search
      ? { OR: [{ action: { contains: search.toUpperCase() } }, { entity: { contains: search, mode: 'insensitive' } }] }
      : {};
    const [total, items] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { name: true, email: true } } },
      }),
    ]);
    return { total, page, pageSize, items };
  }
}
