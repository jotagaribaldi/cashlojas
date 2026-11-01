import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { NormalizeEmail, Sanitize } from '../common/utils/sanitize';

export class UpdateProfileDto {
  @Sanitize()
  @IsString()
  @Length(3, 120, { message: 'Nome deve ter entre 3 e 120 caracteres' })
  name: string;

  @NormalizeEmail()
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(160)
  email: string;

  @Sanitize()
  @IsString()
  @Length(5, 20, { message: 'RG inválido' })
  rg: string;
}
