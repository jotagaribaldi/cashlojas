import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, ReqContext, Roles } from '../common/decorators';
import { PaginationQuery } from '../common/pagination';
import { AuthUser, RequestContext } from '../common/types';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, CustomerListQuery, LookupCustomerDto, UpdateCustomerCpfDto, UpdateProfessionalDto } from './dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @Roles(Role.ROOT, Role.CASHIER, Role.MANAGER)
  list(@CurrentUser() user: AuthUser, @Query() q: CustomerListQuery) {
    return this.customers.listForStore(user.storeId, q.search, q.page, q.pageSize, q.professional === 'true');
  }

  @Roles(Role.CASHIER, Role.MANAGER)
  @Get('redemption-requests')
  redemptionRequests(@CurrentUser() user: AuthUser) {
    return this.customers.openRedemptionRequests(user.storeId!);
  }

  @Roles(Role.CASHIER, Role.MANAGER)
  @Get('lookup')
  lookup(@CurrentUser() user: AuthUser, @Query() q: LookupCustomerDto) {
    return this.customers.lookup({ phone: q.phone, cpf: q.cpf }, user);
  }

  @Roles(Role.CASHIER, Role.MANAGER)
  @Get('professionals')
  professionals(@CurrentUser() user: AuthUser, @Query() q: PaginationQuery) {
    return this.customers.professionals(user.storeId!, q.search);
  }

  @Roles(Role.MANAGER)
  @Patch(':id/professional')
  setProfessional(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProfessionalDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.customers.setProfessional(id, dto, user, ctx.ip);
  }

  @Roles(Role.CASHIER, Role.MANAGER)
  @Patch(':id/cpf')
  updateCpf(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCustomerCpfDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.customers.updateCpf(id, dto.cpf, user, ctx.ip);
  }

  @Roles(Role.CASHIER, Role.MANAGER)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomerDto, @ReqContext() ctx: RequestContext) {
    return this.customers.createAtCounter(dto, user, ctx.ip);
  }

  @Roles(Role.CASHIER, Role.MANAGER)
  @Post(':id/enroll')
  enroll(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.customers.enroll(id, user, ctx.ip);
  }

  @Roles(Role.CASHIER, Role.MANAGER)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(':id/resend-welcome')
  resendWelcome(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.customers.resendWelcome(id, user, ctx.ip);
  }
}
