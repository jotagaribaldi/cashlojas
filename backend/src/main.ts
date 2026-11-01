import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService<Env, true>);
  const isProd = config.get('NODE_ENV', { infer: true }) === 'production';

  if (config.get('TRUST_PROXY', { infer: true })) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: '100kb' });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: isProd ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );
  app.use(cookieParser());

  const origins = config
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: (origin, cb) => {
      if (!origin || origins.includes(origin)) return cb(null, true);
      return cb(new Error('Origem não permitida pelo CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    maxAge: 600,
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      disableErrorMessages: false,
      stopAtFirstError: false,
    }),
  );
  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  Logger.log(`API CashLojas ouvindo na porta ${port}`, 'Bootstrap');
}

void bootstrap();
