import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsBoolean, IsEmail, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { UsersService } from '../admin/users.service';
import { CurrentUser, ReqContext, Roles } from '../common/decorators';
import { PaginationQuery } from '../common/pagination';
import { AuthUser, RequestContext } from '../common/types';
import { StrongPassword } from '../common/utils/password-policy';
import { NormalizeEmail, Sanitize } from '../common/utils/sanitize';

export class CreateCashierDto {
  @Sanitize()
  @IsString()
  @Length(3, 120)
  name: string;

  @NormalizeEmail()
  @IsEmail()
  @MaxLength(160)
  email: string;

  @StrongPassword()
  password: string;
}

export class UpdateCashierDto {
  @IsOptional()
  @Sanitize()
  @IsString()
  @Length(3, 120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @StrongPassword()
  password?: string;
}

@Controller('team/cashiers')
@Roles(Role.MANAGER)
export class TeamController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: PaginationQuery) {
    return this.users.list({ role: Role.CASHIER, storeId: user.storeId!, search: q.search, page: q.page, pageSize: q.pageSize });
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCashierDto, @ReqContext() ctx: RequestContext) {
    return this.users.create({ ...dto, role: Role.CASHIER, storeId: user.storeId! }, user, ctx.ip);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCashierDto,
    @ReqContext() ctx: RequestContext,
  ) {
    return this.users.update(id, dto, user, ctx.ip, user.storeId!);
  }
}
