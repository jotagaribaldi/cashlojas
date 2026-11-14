import { formatCnpj, isValidCnpj, normalizeCnpj } from './cnpj';

describe('cnpj', () => {
  it('normaliza para dígitos', () => {
    expect(normalizeCnpj('11.222.333/0001-81')).toBe('11222333000181');
    expect(normalizeCnpj('1122233300018')).toBeNull();
  });

  it('aceita CNPJ com dígitos verificadores corretos', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11222333000181')).toBe(true);
  });

  it('rejeita dígito verificador errado', () => {
    expect(isValidCnpj('11.222.333/0001-82')).toBe(false);
  });

  it('rejeita sequências repetidas e tamanho inválido', () => {
    expect(isValidCnpj('11111111111111')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
    expect(isValidCnpj('1122233300018')).toBe(false);
    expect(isValidCnpj('')).toBe(false);
  });

  it('formata para exibição', () => {
    expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatCnpj('123')).toBe('123');
  });
});
