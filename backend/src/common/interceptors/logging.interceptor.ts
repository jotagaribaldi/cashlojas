import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { AuthUser } from '../types';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const started = Date.now();
    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse<Response>();
        this.logger.log(
          `${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${Date.now() - started}ms user=${req.user?.id ?? '-'} ip=${req.ip}`,
        );
      }),
    );
  }
}
