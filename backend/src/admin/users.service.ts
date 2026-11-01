import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../auth/auth.service';
import { TokenService } from '../auth/token.service';
import { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto';

export const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  storeId: true,
  lastLoginAt: true,
  lockedUntil: true,
  createdAt: true,
  store: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  private async assertStore(role: Role, storeId: string | null | undefined) {
    if (role === Role.ROOT) return null;
    if (!storeId) throw new BadRequestException('Gerentes e caixas precisam estar vinculados a uma loja');
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
    if (!store) throw new BadRequestException('Loja inválida');
    return storeId;
  }

  async list(params: { role?: Role; storeId?: string; search?: string; page: number; pageSize: number }) {
    const where: Prisma.UserWhereInput = {
      role: params.role ?? { not: Role.CUSTOMER },
      ...(params.storeId ? { storeId: params.storeId } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { email: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: userSelect,
      }),
    ]);
    return { total, page: params.page, pageSize: params.pageSize, items };
  }

  async create(dto: CreateUserDto, actor: AuthUser, ip?: string) {
    const storeId = await this.assertStore(dto.role, dto.storeId);
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } });
    if (exists) throw new ConflictException('E-mail já cadastrado');
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        role: dto.role,
        storeId,
        passwordHash: await hashPassword(dto.password),
      },
      select: userSelect,
    });
    await this.audit.log({ userId: actor.id, action: 'USER_CREATED', entity: 'User', entityId: user.id, metadata: { role: dto.role }, ip });
    return user;
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser, ip?: string, restrictToStore?: string) {
    const current = await this.prisma.user.findUnique({ where: { id } });
    if (!current || current.role === Role.CUSTOMER) throw new NotFoundException('Usuário não encontrado');
    if (restrictToStore && (current.storeId !== restrictToStore || current.role !== Role.CASHIER)) {
      throw new NotFoundException('Usuário não encontrado');
    }
    if (id === actor.id && (dto.active === false || (dto.role && dto.role !== current.role))) {
      throw new ForbiddenException('Você não pode desativar ou alterar o papel do próprio usuário');
    }

    const role = dto.role ?? current.role;
    const storeId = role === Role.ROOT ? null : await this.assertStore(role, dto.storeId ?? current.storeId);
    const securityChange =
      dto.password !== undefined || (dto.active !== undefined && dto.active !== current.active) || role !== current.role || storeId !== current.storeId;

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        role,
        storeId,
        active: dto.active,
        ...(dto.password
          ? { passwordHash: await hashPassword(dto.password), failedLoginAttempts: 0, lockedUntil: null }
          : {}),
        ...(securityChange ? { passwordChangedAt: new Date() } : {}),
      },
      select: userSelect,
    });
    if (securityChange) await this.tokens.revokeAllForUser(id);
    await this.audit.log({
      userId: actor.id,
      action: 'USER_UPDATED',
      entity: 'User',
      entityId: id,
      metadata: { fields: Object.keys(dto).filter((k) => k !== 'password'), passwordReset: !!dto.password },
      ip,
    });
    return user;
  }

  async unlock(id: string, actor: AuthUser, ip?: string) {
    const user = await this.prisma.user.update({
      where: { id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
      select: userSelect,
    });
    await this.audit.log({ userId: actor.id, action: 'USER_UNLOCKED', entity: 'User', entityId: id, ip });
    return user;
  }
}
