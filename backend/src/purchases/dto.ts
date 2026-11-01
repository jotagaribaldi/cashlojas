import { Transform } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { OnlyDigits } from '../common/utils/sanitize';

export const FiscalDocument = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '') : value));

export class CreatePurchaseDto {
  @OnlyDigits()
  @IsString()
  @Length(10, 13, { message: 'Telefone inválido' })
  phone: string;

  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false }, { message: 'Valor inválido' })
  @Min(0.01, { message: 'O valor da compra deve ser maior que zero' })
  @Max(1_000_000, { message: 'Valor acima do limite permitido' })
  amount: number;

  @FiscalDocument()
  @IsString()
  @Length(1, 60)
  @Matches(/^[A-Z0-9./-]+$/, { message: 'Número da nota/cupom fiscal inválido' })
  fiscalDocument: string;

  @IsOptional()
  @IsDateString({ strict: true }, { message: 'Data inválida' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Data deve estar no formato AAAA-MM-DD' })
  purchaseDate?: string;
}
