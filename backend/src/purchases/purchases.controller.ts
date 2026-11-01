import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { CurrentUser, ReqContext, Roles } from '../common/decorators';
import { DateRangeQuery } from '../common/pagination';
import { AuthUser, RequestContext } from '../common/types';
import { CreatePurchaseDto } from './dto';
import { PurchasesService } from './purchases.service';

@Controller('purchases')
@Roles(Role.ROOT, Role.CASHIER, Role.MANAGER)
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePurchaseDto, @ReqContext() ctx: RequestContext) {
    return this.purchases.create(dto, user, ctx.ip);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: DateRangeQuery) {
    return this.purchases.list(user.storeId, q.page, q.pageSize, q.search, q.from, q.to);
  }
}
