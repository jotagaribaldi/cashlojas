import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, Roles } from '../common/decorators';
import { PaginationQuery } from '../common/pagination';
import { AuthUser } from '../common/types';
import { UpdateProfileDto } from './dto';
import { MeService } from './me.service';

@Controller('me')
@Roles(Role.CUSTOMER)
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get('profile')
  profile(@CurrentUser() user: AuthUser) {
    return this.me.profile(user.id);
  }

  @Patch('profile')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.me.updateProfile(user.id, dto);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.me.summary(user.id);
  }

  @Get('credits')
  credits(@CurrentUser() user: AuthUser, @Query() q: PaginationQuery) {
    return this.me.credits(user.id, q.page, q.pageSize);
  }

  @Get('redemptions')
  redemptions(@CurrentUser() user: AuthUser, @Query() q: PaginationQuery) {
    return this.me.redemptions(user.id, q.page, q.pageSize);
  }

  @Get('stores')
  stores(@CurrentUser() user: AuthUser) {
    return this.me.stores(user.id);
  }

  @Post('stores/:storeId')
  enroll(@CurrentUser() user: AuthUser, @Param('storeId', new ParseUUIDPipe()) storeId: string) {
    return this.me.enroll(user.id, storeId);
  }

  @Get('redemption-requests')
  redemptionRequests(@CurrentUser() user: AuthUser) {
    return this.me.redemptionRequests(user.id);
  }

  @Post('redemption-requests/:storeId')
  requestRedemption(@CurrentUser() user: AuthUser, @Param('storeId', new ParseUUIDPipe()) storeId: string) {
    return this.me.requestRedemption(user.id, storeId);
  }

  @Delete('redemption-requests/:id')
  cancelRedemptionRequest(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.me.cancelRedemptionRequest(user.id, id);
  }

  @Get('purchases')
  purchases(@CurrentUser() user: AuthUser, @Query() q: PaginationQuery) {
    return this.me.purchases(user.id, q.page, q.pageSize);
  }

  @Get('ranking/:storeId')
  ranking(@CurrentUser() user: AuthUser, @Param('storeId', new ParseUUIDPipe()) storeId: string) {
    return this.me.ranking(user.id, storeId);
  }
}
