import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { NormalizeEmail, OnlyDigits, Sanitize } from '../common/utils/sanitize';

export class LookupCustomerDto {
  @OnlyDigits()
  @IsString()
  @Length(10, 13, { message: 'Telefone inválido' })
  phone: string;
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

  @Sanitize()
  @IsString()
  @Length(5, 20, { message: 'RG inválido' })
  rg: string;

  @NormalizeEmail()
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(160)
  email: string;
}
