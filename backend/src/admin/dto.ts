import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Role } from '@prisma/client';
import { DateRangeQuery, PaginationQuery } from '../common/pagination';
import { NormalizeEmail, OnlyDigits, Sanitize } from '../common/utils/sanitize';
import { StrongPassword } from '../common/utils/password-policy';

export class CreateGroupDto {
  @Sanitize()
  @IsString()
  @Length(2, 120)
  name: string;

  @Sanitize()
  @IsString()
  @Length(2, 80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'Slug deve conter apenas letras minúsculas, números e hífens' })
  slug: string;
}

export class UpdateGroupDto {
  @IsOptional()
  @Sanitize()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateStoreDto {
  @IsUUID('4')
  groupId: string;

  @Sanitize()
  @IsString()
  @Length(2, 120)
  name: string;

  @Sanitize()
  @IsString()
  @Length(2, 120)
  segment: string;

  @IsOptional()
  @OnlyDigits()
  @IsString()
  @Length(14, 14, { message: 'CNPJ deve ter 14 dígitos' })
  cnpj?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  cashbackPercent: number;

  @Type(() => Number)
  @IsInt()
  @IsIn([30, 90, 120], { message: 'A validade deve ser de 30, 90 ou 120 dias' })
  validityDays: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(100)
  maxRedeemPercent?: number;
}

export class UpdateStoreDto {
  @IsOptional()
  @IsUUID('4')
  groupId?: string;

  @IsOptional()
  @Sanitize()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @Sanitize()
  @IsString()
  @Length(2, 120)
  segment?: string;

  @IsOptional()
  @OnlyDigits()
  @IsString()
  @Length(14, 14, { message: 'CNPJ deve ter 14 dígitos' })
  cnpj?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  cashbackPercent?: number;

  @IsOptional()
  @IsInt()
  @IsIn([30, 90, 120], { message: 'A validade deve ser de 30, 90 ou 120 dias' })
  validityDays?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(100)
  maxRedeemPercent?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export const STAFF_ROLES = [Role.ROOT, Role.MANAGER, Role.CASHIER] as const;

export class CreateUserDto {
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

  @IsIn(STAFF_ROLES)
  role: Role;

  @IsOptional()
  @IsUUID('4')
  storeId?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @Sanitize()
  @IsString()
  @Length(3, 120)
  name?: string;

  @IsOptional()
  @IsIn(STAFF_ROLES)
  role?: Role;

  @IsOptional()
  @IsUUID('4')
  storeId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @StrongPassword()
  password?: string;
}

export class ListUsersQuery extends PaginationQuery {
  @IsOptional()
  @IsIn(Object.values(Role))
  role?: Role;

  @IsOptional()
  @IsUUID('4')
  storeId?: string;
}

export class ListStoresQuery extends PaginationQuery {
  @IsOptional()
  @IsUUID('4')
  groupId?: string;
}

export class AuditLogsQuery extends DateRangeQuery {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsIn(['SUCCESS', 'FAILURE', 'DENIED', 'ERROR'])
  outcome?: string;

  @IsOptional()
  @IsIn(['business', 'http', 'all'])
  kind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  entityId?: string;
}
