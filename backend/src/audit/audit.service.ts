import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';
import { PrismaService } from '../prisma/prisma.service';

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
}

export interface AuditRequestContext {
  ip?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  user?: { id: string; role: string; storeId: string | null };
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

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    const ctx = auditContext.getStore();
    const sameUser = !entry.userId || entry.userId === ctx?.user?.id;
    try {
      await client.auditLog.create({
        data: {
          userId: entry.userId ?? ctx?.user?.id ?? null,
          role: entry.role ?? (sameUser ? ctx?.user?.role : undefined) ?? null,
          storeId: entry.storeId ?? (sameUser ? ctx?.user?.storeId : undefined) ?? null,
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
    }
  }
}

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
