import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const PASSWORD_POLICY_MESSAGE =
  'A senha deve ter no mínimo 10 caracteres, com letra maiúscula, letra minúscula, número e caractere especial';

export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,128}$/;

export function StrongPassword() {
  return applyDecorators(
    IsString(),
    MinLength(10, { message: PASSWORD_POLICY_MESSAGE }),
    MaxLength(128),
    Matches(PASSWORD_REGEX, { message: PASSWORD_POLICY_MESSAGE }),
  );
}
