import { formatCpf, isValidCpf, maskCpf, normalizeCpf } from './cpf';

describe('cpf', () => {
  it('normaliza para dígitos', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
    expect(normalizeCpf('5299822472')).toBeNull();
  });

  it('aceita CPF com dígitos verificadores corretos', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('52998224725')).toBe(true);
  });

  it('rejeita dígito verificador errado', () => {
    expect(isValidCpf('529.982.247-26')).toBe(false);
    expect(isValidCpf('111.111.111-12')).toBe(false);
  });

  it('rejeita sequências repetidas e tamanho inválido', () => {
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('00000000000')).toBe(false);
    expect(isValidCpf('5299822472')).toBe(false);
    expect(isValidCpf('')).toBe(false);
  });

  it('mascara sem expor os seis primeiros dígitos', () => {
    expect(maskCpf('52998224725')).toBe('***.***.247-25');
    expect(maskCpf(null)).toBe('***');
    expect(maskCpf('123')).toBe('***');
  });

  it('formata para exibição', () => {
    expect(formatCpf('52998224725')).toBe('529.982.247-25');
    expect(formatCpf('123')).toBe('123');
  });
});
