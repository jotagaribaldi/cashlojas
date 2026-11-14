import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { PaginationQuery } from '../common/pagination';
import { NormalizeEmail, OnlyDigits, Sanitize } from '../common/utils/sanitize';

export class CreateAdministradoraDto {
  @OnlyDigits()
  @IsString()
  @Length(14, 14, { message: 'CNPJ deve ter 14 dígitos' })
  cnpj: string;

  @Sanitize()
  @IsString()
  @Length(3, 160, { message: 'Nome deve ter entre 3 e 160 caracteres' })
  name: string;

  @NormalizeEmail()
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(160)
  email: string;
}

export class UpdateAdministradoraDto {
  @IsOptional()
  @Sanitize()
  @IsString()
  @Length(3, 160, { message: 'Nome deve ter entre 3 e 160 caracteres' })
  name?: string;

  @IsOptional()
  @NormalizeEmail()
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateCondominioDto {
  @OnlyDigits()
  @IsString()
  @Length(14, 14, { message: 'CNPJ deve ter 14 dígitos' })
  cnpj: string;

  @Sanitize()
  @IsString()
  @Length(3, 160, { message: 'Nome deve ter entre 3 e 160 caracteres' })
  name: string;

  @IsString()
  @Length(36, 36, { message: 'Administradora inválida' })
  administradoraId: string;

  @IsOptional()
  @IsInt({ message: 'Comissão inválida' })
  @Min(0, { message: 'A comissão não pode ser negativa' })
  @Max(10000, { message: 'A comissão não pode passar de 100%' })
  commissionPercentBps?: number;
}

export class UpdateCondominioDto {
  @IsOptional()
  @Sanitize()
  @IsString()
  @Length(3, 160, { message: 'Nome deve ter entre 3 e 160 caracteres' })
  name?: string;

  @IsOptional()
  @IsInt({ message: 'Comissão inválida' })
  @Min(0, { message: 'A comissão não pode ser negativa' })
  @Max(10000, { message: 'A comissão não pode passar de 100%' })
  commissionPercentBps?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CreateUnidadeDto {
  @Sanitize()
  @IsString()
  @Length(1, 40, { message: 'Identificação da unidade deve ter até 40 caracteres' })
  label: string;
}

export class InviteUserDto {
  @Sanitize()
  @IsString()
  @Length(3, 120, { message: 'Nome deve ter entre 3 e 120 caracteres' })
  name: string;

  @NormalizeEmail()
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(160)
  email: string;
}

export class CreateMoradiaDto {
  @IsString()
  @Length(36, 36, { message: 'Cliente inválido' })
  customerId: string;

  @IsString()
  @Length(36, 36, { message: 'Unidade inválida' })
  unidadeId: string;
}

export class ListCondominiosQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  @Length(36, 36, { message: 'Administradora inválida' })
  administradoraId?: string;
}
