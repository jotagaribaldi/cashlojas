import { validateEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/cashlojas',
  JWT_ACCESS_SECRET: 'local-test-key-with-at-least-32-characters-long',
};

describe('configuração de ambiente', () => {
  it('usa valores seguros padrão para desenvolvimento', () => {
    const config = validateEnv(base);
    expect(config.WHATSAPP_PROVIDER).toBe('log');
    expect(config.COOKIE_SECURE).toBe(false);
    expect(config.JWT_ACCESS_TTL_SECONDS).toBe(900);
  });

  it('exige segredo de assinatura longo e rejeita valores de exemplo', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'curto' })).toThrow('ao menos 32 caracteres');
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS' })).toThrow('Substitua JWT_ACCESS_SECRET');
  });

  it('recusa integração Meta sem credenciais e templates', () => {
    expect(() => validateEnv({ ...base, WHATSAPP_PROVIDER: 'meta' })).toThrow('WHATSAPP_META_TOKEN');
    expect(() => validateEnv({
      ...base,
      WHATSAPP_PROVIDER: 'meta',
      WHATSAPP_META_TOKEN: 'token-placeholder',
      WHATSAPP_META_PHONE_NUMBER_ID: '123456',
    })).toThrow('templates aprovados');
  });

  it('exige URL da WAHA e usa sessão padrão', () => {
    expect(() => validateEnv({ ...base, WHATSAPP_PROVIDER: 'waha' })).toThrow('WHATSAPP_WAHA_BASE_URL');
    const ok = validateEnv({
      ...base,
      WHATSAPP_PROVIDER: 'waha',
      WHATSAPP_WAHA_BASE_URL: 'https://apiwa.exemplo.com.br',
    });
    expect(ok.WHATSAPP_WAHA_SESSION).toBe('default');
  });
});
