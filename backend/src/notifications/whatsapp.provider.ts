import { Logger } from '@nestjs/common';
import { maskPhone } from '../common/utils/phone';

export interface WhatsAppMessage {
  to: string;
  text: string;
  storedText?: string;
  template?: { name: string; language: string; params: string[] };
}

export interface WhatsAppProvider {
  send(message: WhatsAppMessage): Promise<{ providerId?: string }>;
}

export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

export class LogWhatsAppProvider implements WhatsAppProvider {
  private readonly logger = new Logger('WhatsApp(log)');

  async send(message: WhatsAppMessage) {
    this.logger.log(`Mensagem simulada para ${maskPhone(message.to)}; conteúdo omitido (${message.text.length} caracteres).`);
    return { providerId: `log-${Date.now()}` };
  }
}

export class MetaWhatsAppProvider implements WhatsAppProvider {
  constructor(
    private readonly token: string,
    private readonly phoneNumberId: string,
    private readonly apiVersion: string,
  ) {}

  async send(message: WhatsAppMessage) {
    const body = message.template
      ? {
          messaging_product: 'whatsapp',
          to: message.to,
          type: 'template',
          template: {
            name: message.template.name,
            language: { code: message.template.language },
            components: [
              { type: 'body', parameters: message.template.params.map((text) => ({ type: 'text', text })) },
            ],
          },
        }
      : { messaging_product: 'whatsapp', to: message.to, type: 'text', text: { body: message.text } };

    const res = await fetch(`https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${json.error?.message ?? 'erro desconhecido'}`);
    return { providerId: json.messages?.[0]?.id };
  }
}

/**
 * WAHA (WhatsApp HTTP API auto-hospedada). Envia texto livre pela sessão conectada,
 * sem depender de templates aprovados. Útil para MVP/homologação; a integração Meta
 * acima permanece disponível para produção oficial.
 */
export class WahaWhatsAppProvider implements WhatsAppProvider {
  private readonly logger = new Logger('WhatsApp(waha)');

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
    private readonly session: string,
  ) {}

  private get root() {
    return this.baseUrl.replace(/\/+$/, '');
  }

  private get authHeaders(): Record<string, string> {
    return this.apiKey ? { 'X-Api-Key': this.apiKey } : {};
  }

  // O número cadastrado pode diferir do número registrado no WhatsApp (ex.: nono dígito em celulares
  // antigos). A WAHA consulta o WhatsApp e devolve o identificador real do contato.
  private async resolveChatId(phone: string): Promise<string> {
    const url = `${this.root}/api/contacts/check-exists?phone=${encodeURIComponent(phone)}&session=${encodeURIComponent(this.session)}`;
    let data: { numberExists?: boolean; chatId?: string; pn?: string } | undefined;
    try {
      const res = await fetch(url, { headers: this.authHeaders, signal: AbortSignal.timeout(10_000) });
      if (res.ok) data = (await res.json()) as typeof data;
      else this.logger.warn(`check-exists retornou HTTP ${res.status}; usando o número informado.`);
    } catch (err) {
      this.logger.warn(`Falha ao consultar check-exists (${err instanceof Error ? err.message : 'erro'}); usando o número informado.`);
    }
    if (data?.numberExists === false) throw new Error(`O número ${maskPhone(phone)} não possui WhatsApp`);
    return data?.pn ?? data?.chatId ?? `${phone}@c.us`;
  }

  async send(message: WhatsAppMessage) {
    const body = {
      session: this.session,
      chatId: await this.resolveChatId(message.to),
      text: message.text,
    };
    const res = await fetch(`${this.root}/api/sendText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      id?: string | { _serialized?: string };
      message?: string;
      error?: string;
    };
    if (!res.ok) throw new Error(`WAHA ${res.status}: ${json.message ?? json.error ?? 'erro desconhecido'}`);
    // Dependendo do engine, a WAHA devolve "id" como string ou como objeto serializado.
    const providerId = typeof json.id === 'string' ? json.id : json.id?._serialized;
    this.logger.log(`Envio concluído para ${maskPhone(message.to)}${providerId ? ` (id ${providerId.slice(0, 16)}…)` : ''}.`);
    return { providerId: providerId || undefined };
  }
}
