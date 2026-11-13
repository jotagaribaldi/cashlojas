import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { CommissionStatus, Role } from '@prisma/client';
import { IsIn, IsOptional } from 'class-validator';
import { CurrentUser, ReqContext, Roles } from '../common/decorators';
import { PaginationQuery } from '../common/pagination';
import { AuthUser, RequestContext } from '../common/types';
import { CommissionsService } from './commissions.service';

export class CommissionsQuery extends PaginationQuery {
  @IsOptional()
  @IsIn(Object.values(CommissionStatus))
  status?: CommissionStatus;
}

@Controller('commissions')
@Roles(Role.MANAGER)
export class CommissionsController {
  constructor(private readonly commissions: CommissionsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: CommissionsQuery) {
    return this.commissions.list(user.storeId!, q.status, q.search, q.page, q.pageSize);
  }

  @Post(':id/pay')
  pay(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.commissions.pay(id, user, ctx.ip);
  }
}
