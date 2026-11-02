import type { NextFunction, Request, Response } from 'express';
import { AuditOutcome, AuditRequestContext, AuditService, auditContext, redact } from './audit.service';
import { AuthUser } from '../common/types';

const SKIP = new Set(['/api/health']);

function outcomeFor(status: number): AuditOutcome {
  if (status < 400) return 'SUCCESS';
  if (status === 401 || status === 403 || status === 429) return 'DENIED';
  if (status >= 500) return 'ERROR';
  return 'FAILURE';
}

export function auditMiddleware(audit: AuditService) {
  return (req: Request & { user?: AuthUser }, res: Response, next: NextFunction) => {
    const path = req.originalUrl.split('?')[0];
    if (req.method === 'OPTIONS' || SKIP.has(path)) return next();

    const started = Date.now();
    const ua = req.headers['user-agent'];
    const ctx: AuditRequestContext = {
      ip: req.ip,
      userAgent: typeof ua === 'string' ? ua.slice(0, 255) : undefined,
      method: req.method,
      path,
      get user() {
        return req.user ? { id: req.user.id, role: req.user.role, storeId: req.user.storeId } : undefined;
      },
    };

    res.on('finish', () => {
      const pattern = req.route?.path ? `${req.baseUrl ?? ''}${String(req.route.path)}` : path;
      const segment = path.replace(/^\/api\/?/, '').split('/')[0] || 'root';
      const params = { ...(req.params ?? {}) };
      const locals = res.locals as { auditError?: string };
      void audit.log({
        userId: req.user?.id ?? null,
        role: req.user?.role ?? null,
        storeId: req.user?.storeId ?? null,
        action: `HTTP_${req.method}`,
        entity: segment.slice(0, 60),
        entityId: params.id || params.storeId ? String(params.id ?? params.storeId).slice(0, 60) : null,
        outcome: outcomeFor(res.statusCode),
        method: req.method,
        path: pattern,
        statusCode: res.statusCode,
        durationMs: Date.now() - started,
        error: locals.auditError ?? null,
        metadata: redact({
          url: path,
          query: Object.keys(req.query ?? {}).length ? req.query : undefined,
          params: Object.keys(params).length ? params : undefined,
          body: req.method !== 'GET' && req.body && Object.keys(req.body).length ? req.body : undefined,
        }) as never,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      });
    });

    auditContext.run(ctx, next);
  };
}
