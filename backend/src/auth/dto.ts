import { ArrayMaxSize, IsArray, IsEmail, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import { NormalizeEmail, OnlyDigits, Sanitize } from '../common/utils/sanitize';
import { StrongPassword } from '../common/utils/password-policy';

export class LoginDto {
  @NormalizeEmail()
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(160)
  email: string;

  @IsString()
  @Length(1, 128)
  password: string;
}

export class RegisterCustomerDto {
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

  @StrongPassword()
  password: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  storeIds?: string[];
}

export class ChangePasswordDto {
  @IsString()
  @Length(1, 128)
  currentPassword: string;

  @StrongPassword()
  newPassword: string;
}

export class ActivationCheckDto {
  @IsString()
  @Length(20, 120)
  token: string;
}

export class ActivateAccountDto extends ActivationCheckDto {
  @StrongPassword()
  password: string;
}
