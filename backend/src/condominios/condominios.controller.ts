import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, ReqContext, Roles } from '../common/decorators';
import { PaginationQuery } from '../common/pagination';
import { AuthUser, RequestContext } from '../common/types';
import { CondominiosService } from './condominios.service';
import {
  CreateAdministradoraDto,
  CreateCondominioDto,
  CreateMoradiaDto,
  CreateUnidadeDto,
  InviteUserDto,
  ListCondominiosQuery,
  UpdateAdministradoraDto,
  UpdateCondominioDto,
} from './dto';

const Uuid = () => new ParseUUIDPipe({ version: '4' });
const staff: Role[] = [Role.ROOT, Role.SINDICO, Role.ADMINISTRADORA];

@Controller('condominios')
export class CondominiosController {
  constructor(private readonly condominios: CondominiosService) {}

  @Roles(Role.ROOT)
  @Get('administradoras')
  listAdministradoras(@Query() q: PaginationQuery) {
    return this.condominios.listAdministradoras(q.search);
  }

  @Roles(Role.ROOT)
  @Post('administradoras')
  createAdministradora(@Body() dto: CreateAdministradoraDto, @CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.condominios.createAdministradora(dto, user, ctx.ip);
  }

  @Roles(Role.ROOT)
  @Patch('administradoras/:id')
  updateAdministradora(
    @Param('id', Uuid()) id: string,
    @Body() dto: UpdateAdministradoraDto,
    @CurrentUser() user: AuthUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.condominios.updateAdministradora(id, dto, user, ctx.ip);
  }

  @Roles(Role.ROOT)
  @Post('administradoras/:id/users')
  inviteAdministradoraUser(
    @Param('id', Uuid()) id: string,
    @Body() dto: InviteUserDto,
    @CurrentUser() user: AuthUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.condominios.inviteAdministradoraUser(id, dto, user, ctx.ip);
  }

  @Roles(...staff)
  @Get()
  list(@Query() q: ListCondominiosQuery, @CurrentUser() user: AuthUser) {
    return this.condominios.listCondominios(q, user);
  }

  @Roles(Role.ROOT)
  @Post()
  create(@Body() dto: CreateCondominioDto, @CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.condominios.createCondominio(dto, user, ctx.ip);
  }

  @Roles(...staff)
  @Get(':id')
  detail(@Param('id', Uuid()) id: string, @CurrentUser() user: AuthUser) {
    return this.condominios.detailCondominio(id, user);
  }

  @Roles(Role.ROOT)
  @Patch(':id')
  update(
    @Param('id', Uuid()) id: string,
    @Body() dto: UpdateCondominioDto,
    @CurrentUser() user: AuthUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.condominios.updateCondominio(id, dto, user, ctx.ip);
  }

  @Roles(...staff)
  @Get(':id/moradores')
  moradores(@Param('id', Uuid()) id: string, @Query() q: PaginationQuery, @CurrentUser() user: AuthUser) {
    return this.condominios.listMoradores(id, user, q.search);
  }

  @Roles(Role.ROOT)
  @Post(':id/unidades')
  createUnidade(
    @Param('id', Uuid()) id: string,
    @Body() dto: CreateUnidadeDto,
    @CurrentUser() user: AuthUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.condominios.createUnidade(id, dto, user, ctx.ip);
  }

  @Roles(Role.ROOT)
  @Post(':id/sindicos')
  inviteSindico(
    @Param('id', Uuid()) id: string,
    @Body() dto: InviteUserDto,
    @CurrentUser() user: AuthUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.condominios.inviteSindico(id, dto, user, ctx.ip);
  }

  @Roles(Role.ROOT)
  @Delete('unidades/:id')
  @HttpCode(204)
  deleteUnidade(@Param('id', Uuid()) id: string, @CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.condominios.deleteUnidade(id, user, ctx.ip);
  }

  @Roles(Role.ROOT)
  @Post('moradias')
  createMoradia(@Body() dto: CreateMoradiaDto, @CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.condominios.createMoradia(dto, user, ctx.ip);
  }

  @Roles(Role.ROOT)
  @Delete('moradias/:customerId')
  @HttpCode(204)
  deleteMoradia(
    @Param('customerId', Uuid()) customerId: string,
    @CurrentUser() user: AuthUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.condominios.deleteMoradia(customerId, user, ctx.ip);
  }
}
