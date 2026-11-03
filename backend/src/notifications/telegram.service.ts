import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../config/env';

export interface TelegramMessage {
  text: string;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger('Telegram');
  private readonly token: string | undefined;
  private readonly chatId: string | undefined;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.token = config.get('TELEGRAM_BOT_TOKEN', { infer: true });
    this.chatId = config.get('TELEGRAM_CHAT_ID', { infer: true });
    this.enabled = config.get('TELEGRAM_ENABLED', { infer: true });
  }

  private get active(): boolean {
    return this.enabled && !!this.token && !!this.chatId;
  }

  async send(text: string): Promise<void> {
    if (!this.active) return;
    try {
      const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json().catch(() => ({}))) as { ok: boolean; description?: string };
      if (!json.ok) this.logger.warn(`Telegram retornou erro: ${json.description ?? 'desconhecido'}`);
    } catch (err) {
      this.logger.error(`Falha ao enviar Telegram: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  notify(event: string, details: string, opts?: { storeName?: string; userName?: string; userRole?: string; ip?: string }): void {
    if (!this.active) return;
    const time = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const parts: string[] = [`<b>🔔 ${event}</b>`];
    if (opts?.userName) parts.push(`👤 <b>${opts.userName}</b>${opts.userRole ? ` (${opts.userRole})` : ''}`);
    if (opts?.storeName) parts.push(`🏪 ${opts.storeName}`);
    parts.push(`📝 ${details}`);
    if (opts?.ip) parts.push(`🌐 IP: ${opts.ip}`);
    parts.push(`🕐 ${time}`);
    void this.send(parts.join('\n'));
  }
}

@Global()
@Module({
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
