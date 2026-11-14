import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramModule, TelegramService } from '../notifications/telegram.service';

export type AuditOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED' | 'ERROR';

export interface AuditEntry {
  userId?: string | null;
  role?: string | null;
  storeId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  outcome?: AuditOutcome;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  error?: string | null;
  metadata?: Prisma.InputJsonValue;
  ip?: string;
  userAgent?: string;
  /** false quando a mesma requisição já notificou uma ação de negócio. */
  notify?: boolean;
}

export interface AuditRequestContext {
  ip?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  user?: { id: string; role: string; storeId: string | null };
  notified?: boolean;
}

export const auditContext = new AsyncLocalStorage<AuditRequestContext>();

const SENSITIVE = /pass(word)?|senha|token|secret|authorization|cookie|credential/i;
const MAX_JSON = 4000;

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 5) return '[...]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 500) return `${value.slice(0, 500)}…`;
  return value;
}

function safeMetadata(metadata: Prisma.InputJsonValue | undefined): Prisma.InputJsonValue | undefined {
  if (metadata === undefined) return undefined;
  const json = JSON.stringify(redact(metadata));
  if (json === undefined) return undefined;
  return json.length > MAX_JSON ? { truncated: true, preview: json.slice(0, MAX_JSON) } : (JSON.parse(json) as Prisma.InputJsonValue);
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');
  private readonly nameCache = new Map<string, { value: string; at: number }>();
  private static readonly CACHE_TTL_MS = 5 * 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  async log(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    const ctx = auditContext.getStore();
    const sameUser = !entry.userId || entry.userId === ctx?.user?.id;
    const userId = entry.userId ?? ctx?.user?.id ?? null;
    const storeId = entry.storeId ?? (sameUser ? ctx?.user?.storeId : undefined) ?? null;
    try {
      await client.auditLog.create({
        data: {
          userId,
          role: entry.role ?? (sameUser ? ctx?.user?.role : undefined) ?? null,
          storeId,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          outcome: entry.outcome ?? 'SUCCESS',
          method: entry.method ?? ctx?.method,
          path: (entry.path ?? ctx?.path)?.slice(0, 255),
          statusCode: entry.statusCode,
          durationMs: entry.durationMs,
          error: entry.error?.slice(0, 500) ?? null,
          metadata: safeMetadata(entry.metadata),
          ip: entry.ip ?? ctx?.ip,
          userAgent: (entry.userAgent ?? ctx?.userAgent)?.slice(0, 255),
        },
      });
    } catch (err) {
      if (tx) throw err;
      this.logger.error(`Falha ao gravar auditoria ${entry.action}`, err instanceof Error ? err.stack : String(err));
      return;
    }
    if (tx || entry.notify === false) return;
    if (ctx) ctx.notified = true;
    void this.notifyTelegram(entry, userId, storeId);
  }

  private async notifyTelegram(entry: AuditEntry, userId: string | null, storeId: string | null): Promise<void> {
    try {
      const [userName, storeName] = await Promise.all([this.userName(userId), this.storeName(storeId)]);
      const details = [
        `${entry.entity}${entry.entityId ? ` #${entry.entityId.slice(0, 8)}` : ''}`,
        entry.outcome ?? 'SUCCESS',
        entry.statusCode ? `HTTP ${entry.statusCode}` : undefined,
        entry.error ? `erro: ${entry.error}` : undefined,
      ]
        .filter(Boolean)
        .join(' • ');
      this.telegram.notify(entry.action, details, {
        userName: userName ?? 'sistema/anônimo',
        userRole: entry.role ?? undefined,
        storeName: storeName ?? 'sem loja',
        ip: entry.ip ?? undefined,
      });
    } catch (err) {
      this.logger.error(`Falha ao notificar auditoria ${entry.action} no Telegram: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private cached(key: string): string | undefined {
    const hit = this.nameCache.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > AuditService.CACHE_TTL_MS) {
      this.nameCache.delete(key);
      return undefined;
    }
    return hit.value;
  }

  private remember(key: string, value: string): string {
    this.nameCache.set(key, { value, at: Date.now() });
    return value;
  }

  private async userName(userId: string | null): Promise<string | undefined> {
    if (!userId) return undefined;
    const key = `u:${userId}`;
    const hit = this.cached(key);
    if (hit) return hit;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }).catch(() => null);
    return user ? this.remember(key, user.name) : undefined;
  }

  private async storeName(storeId: string | null): Promise<string | undefined> {
    if (!storeId) return undefined;
    const key = `s:${storeId}`;
    const hit = this.cached(key);
    if (hit) return hit;
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { name: true } }).catch(() => null);
    return store ? this.remember(key, store.name) : undefined;
  }
}

@Global()
@Module({
  imports: [TelegramModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
