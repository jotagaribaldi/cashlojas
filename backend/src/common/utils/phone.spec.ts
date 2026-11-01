import { normalizePhone } from './phone';

describe('normalização de telefone BR', () => {
  it('converte número local para formato internacional E.164 sem o sinal +', () => {
    expect(normalizePhone('(11) 99999-0000')).toBe('5511999990000');
    expect(normalizePhone('+55 11 3333-4444')).toBe('551133334444');
  });

  it('rejeita telefone fora dos comprimentos brasileiros', () => {
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('55119999')).toBeNull();
  });
});
