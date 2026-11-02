import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, ReqContext, Roles } from '../common/decorators';
import { PaginationQuery } from '../common/pagination';
import { AuthUser, RequestContext } from '../common/types';
import { AdminService } from './admin.service';
import {
  AuditLogsQuery,
  CreateGroupDto,
  CreateStoreDto,
  CreateUserDto,
  ListStoresQuery,
  ListUsersQuery,
  UpdateGroupDto,
  UpdateStoreDto,
  UpdateUserDto,
} from './dto';
import { UsersService } from './users.service';

const Uuid = () => new ParseUUIDPipe({ version: '4' });

@Controller('admin')
@Roles(Role.ROOT)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly users: UsersService,
  ) {}

  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  @Get('groups')
  listGroups() {
    return this.admin.listGroups();
  }

  @Post('groups')
  createGroup(@Body() dto: CreateGroupDto, @CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.admin.createGroup(dto, user, ctx.ip);
  }

  @Patch('groups/:id')
  updateGroup(
    @Param('id', Uuid()) id: string,
    @Body() dto: UpdateGroupDto,
    @CurrentUser() user: AuthUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.admin.updateGroup(id, dto, user, ctx.ip);
  }

  @Delete('groups/:id')
  @HttpCode(204)
  deleteGroup(@Param('id', Uuid()) id: string, @CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.admin.deleteGroup(id, user, ctx.ip);
  }

  @Get('stores')
  listStores(@Query() q: ListStoresQuery) {
    return this.admin.listStores(q.groupId, q.search, q.page, q.pageSize);
  }

  @Post('stores')
  createStore(@Body() dto: CreateStoreDto, @CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.admin.createStore(dto, user, ctx.ip);
  }

  @Patch('stores/:id')
  updateStore(
    @Param('id', Uuid()) id: string,
    @Body() dto: UpdateStoreDto,
    @CurrentUser() user: AuthUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.admin.updateStore(id, dto, user, ctx.ip);
  }

  @Delete('stores/:id')
  @HttpCode(204)
  deleteStore(@Param('id', Uuid()) id: string, @CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.admin.deleteStore(id, user, ctx.ip);
  }

  @Get('users')
  listUsers(@Query() q: ListUsersQuery) {
    return this.users.list(q);
  }

  @Post('users')
  createUser(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.users.create(dto, user, ctx.ip);
  }

  @Patch('users/:id')
  updateUser(
    @Param('id', Uuid()) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.users.update(id, dto, user, ctx.ip);
  }

  @Post('users/:id/unlock')
  @HttpCode(200)
  unlockUser(@Param('id', Uuid()) id: string, @CurrentUser() user: AuthUser, @ReqContext() ctx: RequestContext) {
    return this.users.unlock(id, user, ctx.ip);
  }

  @Get('audit-logs')
  auditLogs(@Query() q: AuditLogsQuery) {
    return this.admin.auditLogs(q);
  }

  @Get('audit-logs/actions')
  auditActions() {
    return this.admin.auditActions();
  }
}
