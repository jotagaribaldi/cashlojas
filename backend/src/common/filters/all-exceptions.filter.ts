import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Erro interno. Tente novamente mais tarde.';

    if (exception instanceof ThrottlerException) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      message = 'Muitas requisições. Aguarde alguns instantes e tente novamente.';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ?? exception.message);
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = 'Registro duplicado';
      } else if (exception.code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'Registro não encontrado';
      } else if (exception.code === 'P2003') {
        status = HttpStatus.CONFLICT;
        message = 'Operação viola integridade referencial';
      }
    }

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else if (status !== 401 && status !== 404) {
      this.logger.warn(`${req.method} ${req.originalUrl} -> ${status}: ${JSON.stringify(message)}`);
    }

    res.status(status).json({
      statusCode: status,
      message,
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    });
  }
}
