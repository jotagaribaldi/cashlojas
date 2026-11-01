import { PASSWORD_REGEX } from './password-policy';

describe('política de senha', () => {
  it('exige maiúscula, minúscula, número, símbolo e comprimento mínimo', () => {
    expect(PASSWORD_REGEX.test('SenhaSegura123!')).toBe(true);
    expect(PASSWORD_REGEX.test('senha123')).toBe(false);
    expect(PASSWORD_REGEX.test('SENHASEMNUMERO!')).toBe(false);
    expect(PASSWORD_REGEX.test('Aa1!')).toBe(false);
  });
});
