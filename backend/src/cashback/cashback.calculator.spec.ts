import {
  allocateRedemption,
  calculateCashback,
  InsufficientBalanceError,
  maxRedeemable,
  sumBalance,
} from './cashback.calculator';

const now = new Date('2026-10-30T12:00:00Z');
const future = (days: number) => new Date(now.getTime() + days * 86_400_000);

describe('cashback.calculator', () => {
  it('calcula cashback em centavos com arredondamento para baixo', () => {
    expect(calculateCashback(10_000, 500)).toBe(500);
    expect(calculateCashback(12_345, 300)).toBe(370);
    expect(calculateCashback(0, 500)).toBe(0);
    expect(calculateCashback(1000, 0)).toBe(0);
  });

  it('limita o resgate ao saldo e ao percentual máximo da compra', () => {
    expect(maxRedeemable(5_000, 10_000, 10_000)).toBe(5_000);
    expect(maxRedeemable(5_000, 10_000, 3_000)).toBe(3_000);
    expect(maxRedeemable(0, 10_000, 10_000)).toBe(0);
  });

  it('ignora créditos expirados no saldo', () => {
    const credits = [
      { id: 'a', remainingCents: 100, expiresAt: future(-1) },
      { id: 'b', remainingCents: 250, expiresAt: future(10) },
    ];
    expect(sumBalance(credits, now)).toBe(250);
  });

  it('consome créditos por ordem de vencimento (FIFO)', () => {
    const credits = [
      { id: 'late', remainingCents: 1_000, expiresAt: future(60) },
      { id: 'soon', remainingCents: 300, expiresAt: future(5) },
      { id: 'expired', remainingCents: 5_000, expiresAt: future(-2) },
    ];
    expect(allocateRedemption(credits, 800, now)).toEqual([
      { creditId: 'soon', amountCents: 300 },
      { creditId: 'late', amountCents: 500 },
    ]);
  });

  it('recusa resgate maior que o saldo válido', () => {
    const credits = [{ id: 'a', remainingCents: 100, expiresAt: future(5) }];
    expect(() => allocateRedemption(credits, 101, now)).toThrow(InsufficientBalanceError);
  });
});
