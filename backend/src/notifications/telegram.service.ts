import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from '../config/env';

export interface TelegramMessage {
  text: string;
}

export interface TelegramNotifyOptions {
  storeName?: string;
  userName?: string;
  userRole?: string;
  ip?: string;
}

const MAX_MESSAGE = 3800;
const MIN_GAP_MS = 3200;
const MAX_COALESCE = 8;

@Injectable()
export class TelegramService {
  private readonly logger = new Logger('Telegram');
  private readonly token: string | undefined;
  private readonly chatId: string | undefined;
  private readonly enabled: boolean;
  private queue: string[] = [];
  private draining = false;
  private lastSentAt = 0;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.token = config.get('TELEGRAM_BOT_TOKEN', { infer: true });
    this.chatId = config.get('TELEGRAM_CHAT_ID', { infer: true });
    this.enabled = config.get('TELEGRAM_ENABLED', { infer: true });
    if (!this.enabled) {
      this.logger.warn('Telegram desativado (TELEGRAM_ENABLED=false): nenhuma notificação será enviada');
    } else if (!this.token || !this.chatId) {
      this.logger.warn('Telegram ativo, mas TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não configurados: envio ignorado');
    } else {
      this.logger.log(`Telegram ativo para o chat ${this.chatId}`);
    }
  }

  private get active(): boolean {
    return this.enabled && !!this.token && !!this.chatId;
  }

  /** Enfileira uma mensagem. O envio respeita o limite do Telegram e agrupa mensagens pendentes. */
  send(text: string): void {
    if (!this.active) return;
    this.queue.push(text.slice(0, MAX_MESSAGE));
    void this.drain();
  }

  notify(event: string, details: string, opts?: TelegramNotifyOptions): void {
    if (!this.active) return;
    const time = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const parts: string[] = [`<b>🔔 ${escapeHtml(event)}</b>`];
    if (opts?.userName) parts.push(`👤 <b>${escapeHtml(opts.userName)}</b>${opts.userRole ? ` (${escapeHtml(opts.userRole)})` : ''}`);
    if (opts?.storeName) parts.push(`🏪 ${escapeHtml(opts.storeName)}`);
    parts.push(`📝 ${escapeHtml(details)}`);
    if (opts?.ip) parts.push(`🌐 IP: ${escapeHtml(opts.ip)}`);
    parts.push(`🕐 ${time}`);
    this.send(parts.join('\n'));
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length) {
        const wait = this.lastSentAt + MIN_GAP_MS - Date.now();
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        const batch = this.queue.splice(0, MAX_COALESCE);
        this.lastSentAt = Date.now();
        await this.post(batch.join('\n\n'));
      }
    } finally {
      this.draining = false;
    }
  }

  private async post(text: string): Promise<void> {
    try {
      const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.chatId, text: text.slice(0, MAX_MESSAGE), parse_mode: 'HTML', disable_web_page_preview: true }),
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json().catch(() => ({}))) as { ok: boolean; description?: string };
      if (!json.ok) this.logger.warn(`Telegram retornou erro: ${json.description ?? 'desconhecido'}`);
    } catch (err) {
      this.logger.error(`Falha ao enviar Telegram: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

@Global()
@Module({
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
