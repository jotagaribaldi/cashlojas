import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../config/env';
import { EMAIL_PROVIDER, EmailProvider, LogEmailProvider, SmtpEmailProvider } from './email.provider';
import { NotificationsService } from './notifications.service';
import { LogWhatsAppProvider, MetaWhatsAppProvider, WahaWhatsAppProvider, WHATSAPP_PROVIDER } from './whatsapp.provider';

@Global()
@Module({
  providers: [
    {
      provide: WHATSAPP_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const mode = config.get('WHATSAPP_PROVIDER', { infer: true });
        if (mode === 'meta') {
          return new MetaWhatsAppProvider(
            config.get('WHATSAPP_META_TOKEN', { infer: true })!,
            config.get('WHATSAPP_META_PHONE_NUMBER_ID', { infer: true })!,
            config.get('WHATSAPP_META_API_VERSION', { infer: true }),
          );
        }
        if (mode === 'waha') {
          return new WahaWhatsAppProvider(
            config.get('WHATSAPP_WAHA_BASE_URL', { infer: true })!,
            config.get('WHATSAPP_WAHA_API_KEY', { infer: true }),
            config.get('WHATSAPP_WAHA_SESSION', { infer: true }),
          );
        }
        return new LogWhatsAppProvider();
      },
    },
    {
      provide: EMAIL_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const mode = config.get('EMAIL_PROVIDER', { infer: true });
        if (mode === 'smtp') {
          const host = config.get('SMTP_HOST', { infer: true });
          const fromEmail = config.get('SMTP_FROM_EMAIL', { infer: true });
          if (!host || !fromEmail) throw new Error('SMTP_HOST e SMTP_FROM_EMAIL são obrigatórios com EMAIL_PROVIDER=smtp');
          return new SmtpEmailProvider(
            host,
            config.get('SMTP_PORT', { infer: true }),
            config.get('SMTP_SECURE', { infer: true }),
            config.get('SMTP_USER', { infer: true }),
            config.get('SMTP_PASSWORD', { infer: true }),
            config.get('SMTP_FROM_NAME', { infer: true }),
            fromEmail,
            config.get('SMTP_TLS_REJECT_UNAUTHORIZED', { infer: true }),
          );
        }
        return new LogEmailProvider();
      },
    },
    NotificationsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
