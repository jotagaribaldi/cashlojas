import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../config/env';
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
    NotificationsService,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
