import { IsEmail, IsEnum, IsNumber, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';
import { RedemptionStatus } from '@prisma/client';
import { PaginationQuery } from '../common/pagination';
import { NormalizeEmail, OnlyDigits, Sanitize } from '../common/utils/sanitize';
import { FiscalDocument } from '../purchases/dto';

export class CreateRedemptionDto {
  @OnlyDigits()
  @IsString()
  @Length(10, 13, { message: 'Telefone inválido' })
  phone: string;

  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false }, { message: 'Valor da compra inválido' })
  @Min(0.01)
  @Max(1_000_000)
  purchaseAmount: number;

  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false }, { message: 'Valor de desconto inválido' })
  @Min(0.01, { message: 'O desconto deve ser maior que zero' })
  @Max(1_000_000)
  discount: number;

  @FiscalDocument()
  @IsString()
  @Length(1, 60)
  @Matches(/^[A-Z0-9./-]+$/, { message: 'Número da nota/cupom fiscal inválido' })
  fiscalDocument: string;
}

export class DecisionDto {
  @IsOptional()
  @Sanitize()
  @IsString()
  @MaxLength(255)
  note?: string;
}

export class ApproveWithCredentialsDto extends DecisionDto {
  @NormalizeEmail()
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(160)
  email: string;

  @IsString()
  @Length(1, 128)
  password: string;
}

export class ListRedemptionsQuery extends PaginationQuery {
  @IsOptional()
  @IsEnum(RedemptionStatus)
  status?: RedemptionStatus;
}
