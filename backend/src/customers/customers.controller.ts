import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, ReqContext, Roles } from '../common/decorators';
import { PaginationQuery } from '../common/pagination';
import { AuthUser, RequestContext } from '../common/types';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, LookupCustomerDto } from './dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @Roles(Role.ROOT, Role.CASHIER, Role.MANAGER)
  list(@CurrentUser() user: AuthUser, @Query() q: PaginationQuery) {
    return this.customers.listForStore(user.storeId, q.search, q.page, q.pageSize);
  }

  @Roles(Role.CASHIER, Role.MANAGER)
  @Get('lookup')
  lookup(@CurrentUser() user: AuthUser, @Query() q: LookupCustomerDto) {
    return this.customers.lookup(q.phone, user);
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
