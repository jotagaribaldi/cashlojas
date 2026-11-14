import { IsBoolean, IsEmail, IsIn, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { PaginationQuery } from '../common/pagination';
import { NormalizeEmail, OnlyDigits, Sanitize } from '../common/utils/sanitize';

export class CustomerListQuery extends PaginationQuery {
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'Filtro de profissional inválido' })
  professional?: 'true' | 'false';
}

export class LookupCustomerDto {
  @IsOptional()
  @OnlyDigits()
  @IsString()
  @Length(10, 13, { message: 'Telefone inválido' })
  phone?: string;

  @IsOptional()
  @OnlyDigits()
  @IsString()
  @Length(11, 11, { message: 'CPF deve ter 11 dígitos' })
  cpf?: string;
}

export class CreateCustomerDto {
  @Sanitize()
  @IsString()
  @Length(3, 120, { message: 'Nome deve ter entre 3 e 120 caracteres' })
  name: string;

  @OnlyDigits()
  @IsString()
  @Length(10, 13, { message: 'Telefone inválido' })
  phone: string;

  @IsOptional()
  @OnlyDigits()
  @IsString()
  @Length(11, 11, { message: 'CPF deve ter 11 dígitos' })
  cpf?: string;

  @Sanitize()
  @IsString()
  @Length(5, 20, { message: 'RG inválido' })
  rg: string;

  @NormalizeEmail()
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(160)
  email: string;
}

export class UpdateCustomerCpfDto {
  @OnlyDigits()
  @IsString()
  @Length(11, 11, { message: 'CPF deve ter 11 dígitos' })
  cpf: string;
}

export class UpdateProfessionalDto {
  @IsBoolean()
  isProfessional: boolean;

  @IsOptional()
  @Sanitize()
  @IsString()
  @Length(2, 80, { message: 'Profissão deve ter entre 2 e 80 caracteres' })
  profession?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Comissão inválida' })
  @Min(0, { message: 'A comissão não pode ser negativa' })
  @Max(100, { message: 'A comissão não pode passar de 100%' })
  commissionPercent?: number;
}
