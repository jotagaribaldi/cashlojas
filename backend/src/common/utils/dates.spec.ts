import { addDaysToDateString, endOfDayInOffset, todayInOffset } from './dates';

describe('datas do negócio', () => {
  it('converte UTC para a data local configurada', () => {
    expect(todayInOffset('-03:00', new Date('2026-10-31T01:00:00Z'))).toBe('2026-10-30');
    expect(todayInOffset('+02:00', new Date('2026-10-30T23:00:00Z'))).toBe('2026-10-31');
  });

  it('soma dias de calendário incluindo virada de mês', () => {
    expect(addDaysToDateString('2026-10-30', 30)).toBe('2026-11-29');
    expect(addDaysToDateString('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('calcula vencimento no final do dia local', () => {
    expect(endOfDayInOffset('2026-11-29', '-03:00').toISOString()).toBe('2026-11-30T02:59:59.999Z');
  });
});
