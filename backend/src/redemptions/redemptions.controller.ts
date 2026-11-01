import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { CurrentUser, ReqContext, Roles } from '../common/decorators';
import { AuthUser, RequestContext } from '../common/types';
import { ApproveWithCredentialsDto, CreateRedemptionDto, DecisionDto, ListRedemptionsQuery } from './dto';
import { RedemptionsService } from './redemptions.service';

@Controller('redemptions')
export class RedemptionsController {
  constructor(private readonly redemptions: RedemptionsService) {}

  @Roles(Role.CASHIER, Role.MANAGER)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRedemptionDto, @ReqContext() ctx: RequestContext) {
    return this.redemptions.create(dto, user, ctx.ip);
  }

  @Roles(Role.ROOT, Role.CASHIER, Role.MANAGER)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ListRedemptionsQuery) {
    return this.redemptions.list(user, q.status, q.page, q.pageSize);
  }

  @Roles(Role.ROOT, Role.CASHIER, Role.MANAGER)
  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.redemptions.findForStaff(id, user);
  }

  @Roles(Role.MANAGER)
  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: DecisionDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.redemptions.approve(id, user, dto.note, ctx);
  }

  @Roles(Role.CASHIER)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(':id/approve-with-credentials')
  @HttpCode(200)
  approveWithCredentials(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ApproveWithCredentialsDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.redemptions.approveWithCredentials(id, user, dto, ctx);
  }

  @Roles(Role.MANAGER)
  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: DecisionDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.redemptions.reject(id, user, dto.note, ctx);
  }

  @Roles(Role.CASHIER, Role.MANAGER)
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string, @ReqContext() ctx: RequestContext) {
    return this.redemptions.cancel(id, user, ctx);
  }

  @Roles(Role.CASHIER, Role.MANAGER, Role.CUSTOMER, Role.ROOT)
  @Get(':id/receipt')
  receipt(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.redemptions.receipt(id, user);
  }
}
