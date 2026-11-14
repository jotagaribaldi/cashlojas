import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import { ActivationService } from '../auth/activation.service';
import { hashPassword } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/types';
import { isValidCnpj, normalizeCnpj } from '../common/utils/cnpj';
import { maskCpf } from '../common/utils/cpf';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TelegramService } from '../notifications/telegram.service';
import {
  CreateAdministradoraDto,
  CreateCondominioDto,
  CreateMoradiaDto,
  CreateUnidadeDto,
  InviteUserDto,
  UpdateAdministradoraDto,
  UpdateCondominioDto,
} from './dto';
import { ScopeService } from './scope.service';

@Injectable()
export class CondominiosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly activation: ActivationService,
    private readonly notifications: NotificationsService,
    private readonly telegram: TelegramService,
  ) {}

  private requireCnpj(raw: string): string {
    const cnpj = normalizeCnpj(raw);
    if (!cnpj || !isValidCnpj(cnpj)) throw new BadRequestException('CNPJ inválido. Confira os 14 dígitos.');
    return cnpj;
  }

  private async uniqueCnpj(cnpj: string, model: 'administradora' | 'condominio', ignoreId?: string) {
    const found =
      model === 'administradora'
        ? await this.prisma.administradora.findUnique({ where: { cnpj }, select: { id: true } })
        : await this.prisma.condominio.findUnique({ where: { cnpj }, select: { id: true } });
    if (found && found.id !== ignoreId) throw new ConflictException('Já existe um cadastro com este CNPJ.');
  }

  // ---------- Administradoras ----------

  listAdministradoras(search?: string) {
    return this.prisma.administradora.findMany({
      where: search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { cnpj: { contains: search } }] } : undefined,
      orderBy: { name: 'asc' },
      select: {
        id: true, cnpj: true, name: true, email: true, active: true, createdAt: true,
        _count: { select: { condominios: true, users: true } },
      },
    });
  }

  async createAdministradora(dto: CreateAdministradoraDto, staff: AuthUser, ip?: string) {
    const cnpj = this.requireCnpj(dto.cnpj);
    await this.uniqueCnpj(cnpj, 'administradora');
    const created = await this.prisma.administradora.create({ data: { cnpj, name: dto.name, email: dto.email } });
    await this.audit.log({ userId: staff.id, action: 'ADMINISTRADORA_CREATED', entity: 'Administradora', entityId: created.id, metadata: { cnpj }, ip });
    this.telegram.notify('Administradora cadastrada', `${created.name} • CNPJ ${cnpj}`, { userName: staff.name, userRole: staff.role, ip });
    return created;
  }

  async updateAdministradora(id: string, dto: UpdateAdministradoraDto, staff: AuthUser, ip?: string) {
    const existing = await this.prisma.administradora.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!existing) throw new NotFoundException('Administradora não encontrada');
    const updated = await this.prisma.administradora.update({ where: { id }, data: dto });
    await this.audit.log({ userId: staff.id, action: 'ADMINISTRADORA_UPDATED', entity: 'Administradora', entityId: id, metadata: { fields: Object.keys(dto) }, ip });
    this.telegram.notify('Administradora atualizada', `${updated.name}`, { userName: staff.name, userRole: staff.role, ip });
    return updated;
  }

  // ---------- Condomínios ----------

  async listCondominios(query: { search?: string; page: number; pageSize: number; administradoraId?: string }, staff: AuthUser) {
    const allowed = await this.scope.condominioIds(staff);
    const where: Prisma.CondominioWhereInput = {
      ...(allowed === null ? {} : { id: { in: allowed } }),
      ...(query.administradoraId ? { administradoraId: query.administradoraId } : {}),
      ...(query.search
        ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { cnpj: { contains: query.search } }] }
        : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.condominio.count({ where }),
      this.prisma.condominio.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true, cnpj: true, name: true, commissionPercentBps: true, active: true, createdAt: true,
          administradora: { select: { id: true, name: true } },
          _count: { select: { unidades: true, moradias: true, sindicos: true } },
        },
      }),
    ]);
    return { total, page: query.page, pageSize: query.pageSize, items };
  }

  async createCondominio(dto: CreateCondominioDto, staff: AuthUser, ip?: string) {
    const cnpj = this.requireCnpj(dto.cnpj);
    await this.uniqueCnpj(cnpj, 'condominio');
    const administradora = await this.prisma.administradora.findUnique({ where: { id: dto.administradoraId }, select: { id: true, name: true } });
    if (!administradora) throw new BadRequestException('Administradora inválida');
    const created = await this.prisma.condominio.create({
      data: { cnpj, name: dto.name, administradoraId: dto.administradoraId, ...(dto.commissionPercentBps !== undefined ? { commissionPercentBps: dto.commissionPercentBps } : {}) },
    });
    await this.audit.log({ userId: staff.id, action: 'CONDOMINIO_CREATED', entity: 'Condominio', entityId: created.id, metadata: { cnpj, administradoraId: dto.administradoraId }, ip });
    this.telegram.notify('Condomínio cadastrado', `${created.name} • ${administradora.name}`, { userName: staff.name, userRole: staff.role, ip });
    return created;
  }

  async updateCondominio(id: string, dto: UpdateCondominioDto, staff: AuthUser, ip?: string) {
    const existing = await this.prisma.condominio.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!existing) throw new NotFoundException('Condomínio não encontrado');
    const updated = await this.prisma.condominio.update({ where: { id }, data: dto });
    await this.audit.log({ userId: staff.id, action: 'CONDOMINIO_UPDATED', entity: 'Condominio', entityId: id, metadata: { fields: Object.keys(dto) }, ip });
    this.telegram.notify('Condomínio atualizado', `${updated.name}`, { userName: staff.name, userRole: staff.role, ip });
    return updated;
  }

  async detailCondominio(id: string, staff: AuthUser) {
    await this.scope.assertCondominioAccess(staff, id);
    const condominio = await this.prisma.condominio.findUnique({
      where: { id },
      select: {
        id: true, cnpj: true, name: true, commissionPercentBps: true, active: true, createdAt: true,
        administradora: { select: { id: true, name: true, email: true } },
        unidades: { orderBy: { label: 'asc' }, select: { id: true, label: true, _count: { select: { moradias: true } } } },
        sindicos: {
          where: { endedAt: null },
          select: { id: true, startedAt: true, user: { select: { id: true, name: true, email: true, active: true, lastLoginAt: true } } },
        },
      },
    });
    if (!condominio) throw new NotFoundException('Condomínio não encontrado');
    return condominio;
  }

  async listMoradores(condominioId: string, staff: AuthUser, search?: string) {
    await this.scope.assertCondominioAccess(staff, condominioId);
    const moradias = await this.prisma.moradia.findMany({
      where: {
        condominioId,
        endedAt: null,
        ...(search
          ? { customer: { OR: [{ name: { contains: search, mode: 'insensitive' } }, { cpf: { contains: search.replace(/\D/g, '') } }] } }
          : {}),
      },
      orderBy: { customer: { name: 'asc' } },
      select: {
        id: true, startedAt: true,
        unidade: { select: { id: true, label: true } },
        customer: { select: { id: true, name: true, phone: true, cpf: true, email: true } },
      },
    });
    return moradias.map((moradia) => ({
      id: moradia.id,
      startedAt: moradia.startedAt,
      unidade: moradia.unidade,
      customer: { ...moradia.customer, cpf: maskCpf(moradia.customer.cpf) },
    }));
  }

  // ---------- Unidades ----------

  async createUnidade(condominioId: string, dto: CreateUnidadeDto, staff: AuthUser, ip?: string) {
    const condominio = await this.prisma.condominio.findUnique({ where: { id: condominioId }, select: { id: true, name: true } });
    if (!condominio) throw new NotFoundException('Condomínio não encontrado');
    const created = await this.prisma.unidade
      .create({ data: { condominioId, label: dto.label } })
      .catch((err: unknown) => {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new ConflictException('Já existe uma unidade com esta identificação neste condomínio.');
        }
        throw err;
      });
    await this.audit.log({ userId: staff.id, action: 'UNIDADE_CREATED', entity: 'Unidade', entityId: created.id, metadata: { condominioId, label: dto.label }, ip });
    return created;
  }

  async deleteUnidade(id: string, staff: AuthUser, ip?: string) {
    const unidade = await this.prisma.unidade.findUnique({ where: { id }, select: { id: true, label: true, condominioId: true, _count: { select: { moradias: true } } } });
    if (!unidade) throw new NotFoundException('Unidade não encontrada');
    if (unidade._count.moradias > 0) throw new ConflictException('Esta unidade possui moradores vinculados.');
    await this.prisma.unidade.delete({ where: { id } });
    await this.audit.log({ userId: staff.id, action: 'UNIDADE_DELETED', entity: 'Unidade', entityId: id, metadata: { condominioId: unidade.condominioId, label: unidade.label }, ip });
    this.telegram.notify('Unidade removida', `${unidade.label}`, { userName: staff.name, userRole: staff.role, ip });
  }

  // ---------- Moradias ----------

  async createMoradia(dto: CreateMoradiaDto, staff: AuthUser, ip?: string) {
    const unidade = await this.prisma.unidade.findUnique({
      where: { id: dto.unidadeId },
      select: { id: true, label: true, condominioId: true, condominio: { select: { name: true } } },
    });
    if (!unidade) throw new BadRequestException('Unidade inválida');
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId }, select: { id: true, name: true, cpf: true } });
    if (!customer) throw new BadRequestException('Cliente inválido');
    if (!customer.cpf) throw new BadRequestException('O morador precisa ter CPF cadastrado.');

    const existing = await this.prisma.moradia.findUnique({ where: { customerId: dto.customerId }, select: { id: true, condominioId: true } });
    if (existing) throw new ConflictException('Este cliente já está vinculado a um condomínio.');

    const created = await this.prisma.moradia.create({
      data: { customerId: dto.customerId, condominioId: unidade.condominioId, unidadeId: unidade.id },
    });
    await this.audit.log({
      userId: staff.id, action: 'MORADIA_CREATED', entity: 'Moradia', entityId: created.id,
      metadata: { customerId: dto.customerId, condominioId: unidade.condominioId, unidade: unidade.label, cpf: maskCpf(customer.cpf) }, ip,
    });
    this.telegram.notify('Morador vinculado', `${customer.name} • ${unidade.condominio.name} / ${unidade.label} • CPF ${maskCpf(customer.cpf)}`, { userName: staff.name, userRole: staff.role, ip });
    return created;
  }

  async deleteMoradia(customerId: string, staff: AuthUser, ip?: string) {
    const moradia = await this.prisma.moradia.findUnique({
      where: { customerId },
      select: { id: true, condominioId: true, customer: { select: { name: true } }, unidade: { select: { label: true } } },
    });
    if (!moradia) throw new NotFoundException('Vínculo de moradia não encontrado');
    await this.prisma.moradia.delete({ where: { customerId } });
    await this.audit.log({ userId: staff.id, action: 'MORADIA_DELETED', entity: 'Moradia', entityId: moradia.id, metadata: { customerId, condominioId: moradia.condominioId }, ip });
    this.telegram.notify('Morador desvinculado', `${moradia.customer.name} • ${moradia.unidade.label}`, { userName: staff.name, userRole: staff.role, ip });
  }

  // ---------- Convites ----------

  async inviteSindico(condominioId: string, dto: InviteUserDto, staff: AuthUser, ip?: string) {
    const condominio = await this.prisma.condominio.findUnique({ where: { id: condominioId }, select: { id: true, name: true } });
    if (!condominio) throw new NotFoundException('Condomínio não encontrado');
    const { user, link } = await this.createInvitedUser(dto, Role.SINDICO, staff, ip);
    await this.prisma.sindicoVinculo.create({ data: { userId: user.id, condominioId } });
    this.notifications.notifyInvite({ name: user.name, email: user.email, roleLabel: 'síndico', scopeName: condominio.name, inviteUrl: link });
    await this.audit.log({ userId: staff.id, action: 'SINDICO_INVITED', entity: 'User', entityId: user.id, metadata: { condominioId }, ip });
    this.telegram.notify('Síndico convidado', `${user.name} • ${condominio.name}`, { userName: staff.name, userRole: staff.role, ip });
    return { id: user.id, name: user.name, email: user.email, inviteLink: link };
  }

  async inviteAdministradoraUser(administradoraId: string, dto: InviteUserDto, staff: AuthUser, ip?: string) {
    const administradora = await this.prisma.administradora.findUnique({ where: { id: administradoraId }, select: { id: true, name: true } });
    if (!administradora) throw new NotFoundException('Administradora não encontrada');
    const { user, link } = await this.createInvitedUser(dto, Role.ADMINISTRADORA, staff, ip);
    await this.prisma.administradoraUser.create({ data: { userId: user.id, administradoraId } });
    this.notifications.notifyInvite({ name: user.name, email: user.email, roleLabel: 'administradora', scopeName: administradora.name, inviteUrl: link });
    await this.audit.log({ userId: staff.id, action: 'ADMINISTRADORA_USER_INVITED', entity: 'User', entityId: user.id, metadata: { administradoraId }, ip });
    this.telegram.notify('Usuário de administradora convidado', `${user.name} • ${administradora.name}`, { userName: staff.name, userRole: staff.role, ip });
    return { id: user.id, name: user.name, email: user.email, inviteLink: link };
  }

  private async createInvitedUser(dto: InviteUserDto, role: Role, staff: AuthUser, ip?: string) {
    const emailInUse = await this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } });
    if (emailInUse) throw new ConflictException('Já existe um usuário com este e-mail.');
    const placeholder = await hashPassword(randomBytes(32).toString('hex'));
    const user = await this.prisma.user.create({
      data: { name: dto.name, email: dto.email, role, passwordHash: placeholder },
      select: { id: true, name: true, email: true },
    });
    const link = await this.activation.issueUserLink(user.id);
    await this.audit.log({ userId: staff.id, action: 'USER_INVITED', entity: 'User', entityId: user.id, metadata: { role }, ip });
    return { user, link };
  }
}
