import { CreditSource } from '@prisma/client';
import { CashbackService } from './cashback.service';

function buildService(createMany: jest.Mock) {
  const tx = {
    cashbackCredit: { createMany },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn().mockReturnValue('-03:00') };
  const service = new CashbackService(
    {} as never,
    audit as never,
    {} as never,
    {} as never,
    config as never,
  );
  return { service, tx: tx as never, audit };
}

describe('CashbackService.grantSignupBonus', () => {
  it('não cria crédito quando o bônus da loja é zero', async () => {
    const createMany = jest.fn();
    const { service, tx, audit } = buildService(createMany);

    await expect(
      service.grantSignupBonus(tx, { customerId: 'c1', storeId: 's1', signupBonusCents: 0, validityDays: 90 }),
    ).resolves.toBe(0);
    expect(createMany).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('cria crédito de bônus com saldo integral e validade da loja', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const { service, tx, audit } = buildService(createMany);

    await expect(
      service.grantSignupBonus(tx, {
        customerId: 'c1',
        storeId: 's1',
        signupBonusCents: 500,
        validityDays: 30,
        actor: { userId: 'u1', role: 'CASHIER' },
      }),
    ).resolves.toBe(500);

    const data = createMany.mock.calls[0][0].data[0];
    expect(data).toMatchObject({
      customerId: 'c1',
      storeId: 's1',
      source: CreditSource.SIGNUP_BONUS,
      signupBonusKey: 'c1:s1',
      amountCents: 500,
      remainingCents: 500,
    });
    expect(data.expiresAt).toBeInstanceOf(Date);
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(createMany.mock.calls[0][0].skipDuplicates).toBe(true);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CASHBACK_SIGNUP_BONUS_GRANTED', entityId: 'c1' }),
      tx,
    );
  });

  it('não duplica o bônus quando o índice único bloqueia a inserção', async () => {
    const createMany = jest.fn().mockResolvedValue({ count: 0 });
    const { service, tx, audit } = buildService(createMany);

    await expect(
      service.grantSignupBonus(tx, { customerId: 'c1', storeId: 's1', signupBonusCents: 1000, validityDays: 90 }),
    ).resolves.toBe(0);
    expect(audit.log).not.toHaveBeenCalled();
  });
});
