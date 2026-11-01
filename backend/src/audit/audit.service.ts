import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ip?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    try {
      await client.auditLog.create({
        data: {
          userId: entry.userId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          metadata: entry.metadata,
          ip: entry.ip,
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
