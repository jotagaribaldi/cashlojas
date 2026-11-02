import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === 'true' || v === '1');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET deve ter ao menos 32 caracteres'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_ISSUER: z.string().default('cashlojas-api'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(90),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  APP_PUBLIC_URL: z.string().url().default('http://localhost:5173'),
  ACTIVATION_TTL_HOURS: z.coerce.number().int().positive().default(168),
  COOKIE_SECURE: bool.default(false),
  TRUST_PROXY: bool.default(false),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  BUSINESS_UTC_OFFSET: z
    .string()
    .regex(/^[+-](?:0\d|1[0-4]):[0-5]\d$/)
    .default('-03:00'),
  WHATSAPP_PROVIDER: z.enum(['log', 'meta', 'waha']).default('log'),
  WHATSAPP_META_TOKEN: z.string().optional(),
  WHATSAPP_META_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_META_API_VERSION: z.string().default('v21.0'),
  WHATSAPP_META_TEMPLATE_PURCHASE: z.string().optional(),
  WHATSAPP_META_TEMPLATE_REDEMPTION: z.string().optional(),
  WHATSAPP_META_TEMPLATE_WELCOME: z.string().optional(),
  WHATSAPP_META_TEMPLATE_LANG: z.string().default('pt_BR'),
  WHATSAPP_WAHA_BASE_URL: z.string().url().optional(),
  WHATSAPP_WAHA_API_KEY: z.string().optional(),
  WHATSAPP_WAHA_SESSION: z.string().min(1).default('default'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuração de ambiente inválida: ${issues}`);
  }
  if (parsed.data.JWT_ACCESS_SECRET.startsWith('REPLACE_')) {
    throw new Error('Substitua JWT_ACCESS_SECRET pelo resultado aleatório de um gerador criptográfico antes de iniciar');
  }
  if (parsed.data.WHATSAPP_PROVIDER === 'meta') {
    if (!parsed.data.WHATSAPP_META_TOKEN || !parsed.data.WHATSAPP_META_PHONE_NUMBER_ID) {
      throw new Error('WHATSAPP_META_TOKEN e WHATSAPP_META_PHONE_NUMBER_ID são obrigatórios com WHATSAPP_PROVIDER=meta');
    }
    if (!parsed.data.WHATSAPP_META_TEMPLATE_PURCHASE || !parsed.data.WHATSAPP_META_TEMPLATE_REDEMPTION) {
      throw new Error('Os templates aprovados WHATSAPP_META_TEMPLATE_PURCHASE e WHATSAPP_META_TEMPLATE_REDEMPTION são obrigatórios com WHATSAPP_PROVIDER=meta');
    }
  }
  if (parsed.data.WHATSAPP_PROVIDER === 'waha' && !parsed.data.WHATSAPP_WAHA_BASE_URL) {
    throw new Error('WHATSAPP_WAHA_BASE_URL é obrigatório com WHATSAPP_PROVIDER=waha');
  }
  return parsed.data;
}
