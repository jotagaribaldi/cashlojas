export interface CreditSlice {
  id: string;
  remainingCents: number;
  expiresAt: Date;
}

export interface Allocation {
  creditId: string;
  amountCents: number;
}

export function calculateCashback(amountCents: number, percentBps: number): number {
  if (amountCents <= 0 || percentBps <= 0) return 0;
  return Math.floor((amountCents * percentBps) / 10_000);
}

export function maxRedeemable(balanceCents: number, purchaseAmountCents: number, maxRedeemPercentBps: number): number {
  const cap = Math.floor((purchaseAmountCents * maxRedeemPercentBps) / 10_000);
  return Math.max(0, Math.min(balanceCents, cap));
}

export function sumBalance(credits: CreditSlice[], now: Date = new Date()): number {
  return credits.filter((c) => c.expiresAt > now).reduce((acc, c) => acc + c.remainingCents, 0);
}

export class InsufficientBalanceError extends Error {
  constructor(
    public readonly available: number,
    public readonly requested: number,
  ) {
    super('Saldo de cashback insuficiente');
  }
}

export function allocateRedemption(credits: CreditSlice[], discountCents: number, now: Date = new Date()): Allocation[] {
  if (discountCents <= 0) throw new Error('Valor de desconto deve ser positivo');
  const valid = credits
    .filter((c) => c.expiresAt > now && c.remainingCents > 0)
    .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());

  const available = valid.reduce((acc, c) => acc + c.remainingCents, 0);
  if (available < discountCents) throw new InsufficientBalanceError(available, discountCents);

  const allocations: Allocation[] = [];
  let pending = discountCents;
  for (const credit of valid) {
    if (pending === 0) break;
    const take = Math.min(credit.remainingCents, pending);
    allocations.push({ creditId: credit.id, amountCents: take });
    pending -= take;
  }
  return allocations;
}
