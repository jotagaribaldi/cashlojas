import { Logger } from '@nestjs/common';
import { Transporter, createTransport } from 'nodemailer';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<{ providerId?: string }>;
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export class LogEmailProvider implements EmailProvider {
  private readonly logger = new Logger('Email(log)');

  async send(message: EmailMessage) {
    this.logger.log(`Email simulado para ${message.to}: "${message.subject}" (${message.text.length} caracteres).`);
    return { providerId: `log-${Date.now()}` };
  }
}

export class SmtpEmailProvider implements EmailProvider {
  private readonly logger = new Logger('Email(smtp)');
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(host: string, port: number, secure: boolean, user: string | undefined, password: string | undefined, fromName: string, fromEmail: string, tlsRejectUnauthorized: boolean) {
    this.transport = createTransport({
      host,
      port,
      secure,
      auth: user && password ? { user, pass: password } : undefined,
      // Em servidores com certificado autoassinado ou vencido, o operador pode desativar a
      // validação via SMTP_TLS_REJECT_UNAUTHORIZED=false. O padrão é validar (true/seguro).
      tls: { rejectUnauthorized: tlsRejectUnauthorized },
    });
    this.from = `"${fromName}" <${fromEmail}>`;
  }

  async send(message: EmailMessage) {
    const info = await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    this.logger.log(`Email enviado para ${message.to}: "${message.subject}" (${info.messageId}).`);
    return { providerId: info.messageId };
  }
}
