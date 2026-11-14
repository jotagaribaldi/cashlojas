import { Role } from '@prisma/client';
import { AuthService, hashPassword } from './auth.service';

const PASSWORD = 'SenhaForte123!';

function buildService(overrides: { user?: Record<string, unknown> } = {}) {
  const user = {
    id: 'u1',
    name: 'Maria Gerente',
    email: 'gerente@loja.test',
    role: Role.MANAGER,
    storeId: 'store-1',
    active: true,
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordHash: '',
    ...overrides.user,
  };

  const auditLog = jest.fn().mockResolvedValue(undefined);
  const notify = jest.fn();
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue(user),
    },
    store: { findUnique: jest.fn().mockResolvedValue({ name: 'Construir Ferramentas' }) },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ user: { update: jest.fn().mockResolvedValue({ failedLoginAttempts: 1 }) } }),
    ),
  };
  const config = {
    get: (key: string) =>
      ({ LOGIN_MAX_ATTEMPTS: 5, LOGIN_LOCK_MINUTES: 15, APP_PUBLIC_URL: 'https://cashlojas.topago.com.br' })[key],
  };

  const service = new AuthService(
    prisma as never,
    { issue: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }) } as never,
    { log: auditLog } as never,
    {} as never,
    {} as never,
    { notify } as never,
    config as never,
  );

  return { service, user, auditLog, notify, prisma };
}

describe('AuthService · notificações de login no Telegram', () => {
  it('envia uma única mensagem no login bem-sucedido, com loja e sem duplicar a auditoria', async () => {
    const { service, user, auditLog, notify } = buildService();
    user.passwordHash = await hashPassword(PASSWORD);

    await service.login({ email: user.email, password: PASSWORD } as never, { ip: '203.0.113.9' });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      'Login realizado',
      expect.stringContaining(user.email),
      expect.objectContaining({ userName: user.name, userRole: Role.MANAGER, storeName: 'Construir Ferramentas', ip: '203.0.113.9' }),
    );
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'LOGIN', notify: false }));
  });

  it('envia uma única mensagem de falha com loja quando a senha está errada', async () => {
    const { service, user, auditLog, notify } = buildService();
    user.passwordHash = await hashPassword(PASSWORD);

    await expect(service.login({ email: user.email, password: 'Errada!' } as never, { ip: '203.0.113.10' })).rejects.toThrow();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      'Falha de login',
      expect.stringContaining(user.email),
      expect.objectContaining({ storeName: 'Construir Ferramentas', ip: '203.0.113.10' }),
    );
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'LOGIN_FAILED', notify: false }));
  });

  it('omite a loja para usuário ROOT, que não tem storeId', async () => {
    const { service, user, notify } = buildService({ user: { role: Role.ROOT, storeId: null } });
    user.passwordHash = await hashPassword(PASSWORD);

    await service.login({ email: user.email, password: PASSWORD } as never, { ip: '203.0.113.11' });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][2]).toMatchObject({ storeName: undefined });
  });
});
