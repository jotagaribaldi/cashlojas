import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationStatus, Role } from '@prisma/client';
import { formatBRL } from '../common/utils/money';
import { formatDateBR } from '../common/utils/dates';
import { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { EMAIL_PROVIDER, EmailMessage, EmailProvider } from './email.provider';
import { WHATSAPP_PROVIDER, WhatsAppMessage, WhatsAppProvider } from './whatsapp.provider';

export interface PurchaseMessageData {
  customerId: string;
  customerName: string;
  phone: string;
  email: string;
  storeName: string;
  purchaseDate: string;
  amountCents: number;
  cashbackCents: number;
  balanceCents: number;
  expiresAt: Date;
}

export interface RedemptionMessageData {
  customerId: string;
  customerName: string;
  phone: string;
  email: string;
  storeName: string;
  discountCents: number;
  balanceCents: number;
  authorizationCode: string;
  decidedAt: Date;
}

export interface WelcomeMessageData {
  customerId: string;
  customerName: string;
  phone: string;
  email: string;
  storeName: string;
  activationUrl: string;
}

export interface ExpiringCreditData {
  customerName: string;
  email: string;
  storeName: string;
  cashbackCents: number;
  expiresAt: Date;
}

export interface StaffNotifyData {
  storeId: string;
  subject: string;
  summary: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(WHATSAPP_PROVIDER) private readonly waProvider: WhatsAppProvider,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
  ) {}

  private get offset() {
    return this.config.get('BUSINESS_UTC_OFFSET', { infer: true });
  }

  private get appUrl() {
    return this.config.get('APP_PUBLIC_URL', { infer: true });
  }

  buildPurchaseText(d: PurchaseMessageData): string {
    const firstName = d.customerName.split(' ')[0];
    return [
      `Olá, ${firstName}! Obrigado por comprar na ${d.storeName}.`,
      ``,
      `Data da compra: ${formatDateBR(d.purchaseDate)}`,
      `Valor pago: ${formatBRL(d.amountCents)}`,
      `Cashback desta compra: ${formatBRL(d.cashbackCents)}`,
      `Saldo de cashback acumulado: ${formatBRL(d.balanceCents)}`,
      `Validade deste cashback: ${formatDateBR(d.expiresAt, this.offset)}`,
      ``,
      `Volte até a data de validade e use seu crédito como desconto na próxima compra.`,
    ].join('\n');
  }

  buildPurchaseEmail(d: PurchaseMessageData): EmailMessage {
    return {
      to: d.email,
      subject: `Você recebeu cashback na ${d.storeName}!`,
      text: this.buildPurchaseText(d),
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#18243b">
        <h2 style="color:#16885f">Você recebeu cashback! 🎉</h2>
        <p>Olá, <strong>${d.customerName.split(' ')[0]}</strong>! Obrigado por comprar na <strong>${d.storeName}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;color:#8b96a6">Data da compra</td><td style="padding:8px 0;text-align:right">${formatDateBR(d.purchaseDate)}</td></tr>
          <tr><td style="padding:8px 0;color:#8b96a6">Valor pago</td><td style="padding:8px 0;text-align:right">${formatBRL(d.amountCents)}</td></tr>
          <tr><td style="padding:8px 0;color:#8b96a6">Cashback desta compra</td><td style="padding:8px 0;text-align:right;font-weight:bold;color:#16885f">+${formatBRL(d.cashbackCents)}</td></tr>
          <tr><td style="padding:8px 0;color:#8b96a6">Saldo acumulado</td><td style="padding:8px 0;text-align:right;font-weight:bold">${formatBRL(d.balanceCents)}</td></tr>
          <tr><td style="padding:8px 0;color:#8b96a6">Validade do cashback</td><td style="padding:8px 0;text-align:right">${formatDateBR(d.expiresAt, this.offset)}</td></tr>
        </table>
        <p style="background:#e9f7f0;border-radius:8px;padding:12px 16px">Volte até a data de validade e use seu crédito como desconto na próxima compra.</p>
        <p style="margin-top:24px"><a href="${this.appUrl}" style="color:#16885f">Acompanhe seu saldo e histórico</a></p>
      </div>`,
    };
  }

  buildRedemptionText(d: RedemptionMessageData): string {
    const firstName = d.customerName.split(' ')[0];
    return [
      `Olá, ${firstName}! Você utilizou ${formatBRL(d.discountCents)} de cashback na ${d.storeName}.`,
      `Autorização: ${d.authorizationCode}`,
      `Saldo de cashback restante: ${formatBRL(d.balanceCents)}`,
    ].join('\n');
  }

  buildRedemptionEmail(d: RedemptionMessageData): EmailMessage {
    return {
      to: d.email,
      subject: `Resgate de cashback na ${d.storeName}`,
      text: this.buildRedemptionText(d),
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#18243b">
        <h2>Resgate de cashback realizado</h2>
        <p>Olá, <strong>${d.customerName.split(' ')[0]}</strong>! Você utilizou <strong>${formatBRL(d.discountCents)}</strong> de cashback na <strong>${d.storeName}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px 0;color:#8b96a6">Autorização</td><td style="padding:8px 0;text-align:right;font-family:monospace">${d.authorizationCode}</td></tr>
          <tr><td style="padding:8px 0;color:#8b96a6">Saldo restante</td><td style="padding:8px 0;text-align:right;font-weight:bold">${formatBRL(d.balanceCents)}</td></tr>
        </table>
        <p style="margin-top:24px"><a href="${this.appUrl}" style="color:#16885f">Acompanhe seu saldo</a></p>
      </div>`,
    };
  }

  buildWelcomeText(d: WelcomeMessageData): string {
    const firstName = d.customerName.split(' ')[0];
    return [
      `Olá, ${firstName}! Você foi cadastrado(a) no programa de cashback da ${d.storeName}.`,
      ``,
      `A cada compra você recebe parte do valor de volta como crédito para usar em novas compras nas lojas participantes.`,
      ``,
      `Acesse o link abaixo para criar sua senha e acompanhar seu saldo, o prazo de validade do cashback e o histórico de resgates. Lá você também pode atualizar seus dados:`,
      d.activationUrl,
      ``,
      `Este link é pessoal e tem validade limitada.`,
    ].join('\n');
  }

  buildWelcomeEmail(d: WelcomeMessageData): EmailMessage {
    const firstName = d.customerName.split(' ')[0];
    return {
      to: d.email,
      subject: `Bem-vindo(a) ao programa de cashback da ${d.storeName}!`,
      text: this.buildWelcomeText(d),
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#18243b">
        <h2 style="color:#16885f">Bem-vindo(a) ao programa de cashback! 🎁</h2>
        <p>Olá, <strong>${firstName}</strong>! Você foi cadastrado(a) no programa de cashback da <strong>${d.storeName}</strong>.</p>
        <p>A cada compra você recebe parte do valor de volta como crédito para usar em novas compras nas lojas participantes.</p>
        <div style="text-align:center;margin:24px 0">
          <a href="${d.activationUrl}" style="background:#16885f;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">Criar minha senha</a>
        </div>
        <p style="font-size:13px;color:#8b96a6">Acesse o link acima para criar sua senha e acompanhar seu saldo, o prazo de validade do cashback e o histórico de resgates.</p>
        <p style="font-size:13px;color:#8b96a6">Este link é pessoal e tem validade limitada.</p>
      </div>`,
    };
  }

  buildExpiringCreditEmail(d: ExpiringCreditData): EmailMessage {
    const firstName = d.customerName.split(' ')[0];
    const expiryStr = formatDateBR(d.expiresAt, this.offset);
    return {
      to: d.email,
      subject: `Seu cashback na ${d.storeName} expira em 2 dias!`,
      text: [
        `Olá, ${firstName}! Você tem ${formatBRL(d.cashbackCents)} de cashback na ${d.storeName} que expira em ${expiryStr}.`,
        ``,
        `Não perca! Visite a loja e use seu crédito como desconto em uma nova compra.`,
        `Acesse: ${this.appUrl}`,
      ].join('\n'),
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#18243b">
        <h2 style="color:#b65b54">Seu cashback está prestes a expirar! ⏰</h2>
        <p>Olá, <strong>${firstName}</strong>! Você tem <strong>${formatBRL(d.cashbackCents)}</strong> de cashback na <strong>${d.storeName}</strong> que expira em <strong>${expiryStr}</strong>.</p>
        <p style="background:#fff3f2;border-radius:8px;padding:12px 16px;color:#b65b54">Não perca! Visite a loja e use seu crédito como desconto em uma nova compra.</p>
        <div style="text-align:center;margin:24px 0">
          <a href="${this.appUrl}" style="background:#16885f;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">Ver meu saldo</a>
        </div>
      </div>`,
    };
  }

  private buildStaffEmail(d: StaffNotifyData): EmailMessage {
    return {
      to: '',
      subject: `[CashLojas] ${d.subject}`,
      text: d.summary,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#18243b">
        <h2>${d.subject}</h2>
        <p>${d.summary}</p>
      </div>`,
    };
  }

  notifyWelcome(d: WelcomeMessageData): void {
    const template = this.config.get('WHATSAPP_META_TEMPLATE_WELCOME', { infer: true });
    this.dispatchWhatsapp(d.customerId, {
      to: d.phone,
      text: this.buildWelcomeText(d),
      storedText: this.buildWelcomeText({ ...d, activationUrl: '[link de ativação omitido]' }),
      template: template
        ? {
            name: template,
            language: this.config.get('WHATSAPP_META_TEMPLATE_LANG', { infer: true }),
            params: [d.customerName.split(' ')[0], d.storeName, d.activationUrl],
          }
        : undefined,
    });
    this.dispatchEmail(d.customerId, this.buildWelcomeEmail(d));
  }

  notifyPurchase(d: PurchaseMessageData): void {
    const template = this.config.get('WHATSAPP_META_TEMPLATE_PURCHASE', { infer: true });
    const offset = this.offset;
    this.dispatchWhatsapp(d.customerId, {
      to: d.phone,
      text: this.buildPurchaseText(d),
      template: template
        ? {
            name: template,
            language: this.config.get('WHATSAPP_META_TEMPLATE_LANG', { infer: true }),
            params: [
              d.customerName.split(' ')[0],
              d.storeName,
              formatDateBR(d.purchaseDate),
              formatBRL(d.amountCents),
              formatBRL(d.cashbackCents),
              formatBRL(d.balanceCents),
              formatDateBR(d.expiresAt, offset),
            ],
          }
        : undefined,
    });
    this.dispatchEmail(d.customerId, this.buildPurchaseEmail(d));
  }

  notifyRedemption(d: RedemptionMessageData): void {
    const template = this.config.get('WHATSAPP_META_TEMPLATE_REDEMPTION', { infer: true });
    this.dispatchWhatsapp(d.customerId, {
      to: d.phone,
      text: this.buildRedemptionText(d),
      template: template
        ? {
            name: template,
            language: this.config.get('WHATSAPP_META_TEMPLATE_LANG', { infer: true }),
            params: [
              d.customerName.split(' ')[0],
              formatBRL(d.discountCents),
              d.storeName,
              d.authorizationCode,
              formatBRL(d.balanceCents),
            ],
          }
        : undefined,
    });
    this.dispatchEmail(d.customerId, this.buildRedemptionEmail(d));
  }

  notifyExpiringCredit(d: ExpiringCreditData): void {
    this.dispatchEmail(null, this.buildExpiringCreditEmail(d), d.email);
  }

  notifyStaff(d: StaffNotifyData): void {
    if (!this.config.get('EMAIL_STAFF_NOTIFY', { infer: true })) return;
    void this.deliverStaffEmail(d);
  }

  private dispatchWhatsapp(customerId: string, message: WhatsAppMessage): void {
    void this.deliverWhatsapp(customerId, message);
  }

  private dispatchEmail(customerId: string | null, message: EmailMessage, recipientEmail?: string): void {
    if (!recipientEmail && !message.to) return;
    void this.deliverEmail(customerId, message);
  }

  private async deliverWhatsapp(customerId: string, message: WhatsAppMessage): Promise<void> {
    let notificationId: string | undefined;
    try {
      const notification = await this.prisma.notification.create({
        data: { customerId, channel: 'WHATSAPP', to: message.to, body: message.storedText ?? message.text },
      });
      notificationId = notification.id;
      const { providerId } = await this.waProvider.send(message);
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.SENT, sentAt: new Date(), providerId },
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.error(`Falha ao enviar WhatsApp para cliente ${customerId}: ${error}`);
      if (notificationId) {
        await this.prisma.notification
          .update({ where: { id: notificationId }, data: { status: NotificationStatus.FAILED, error: error.slice(0, 500) } })
          .catch(() => undefined);
      }
    }
  }

  private async deliverEmail(customerId: string | null, message: EmailMessage): Promise<void> {
    let notificationId: string | undefined;
    try {
      if (customerId) {
        const notification = await this.prisma.notification.create({
          data: { customerId, channel: 'EMAIL', to: message.to, body: message.text },
        });
        notificationId = notification.id;
      }
      const { providerId } = await this.emailProvider.send(message);
      if (notificationId) {
        await this.prisma.notification.update({
          where: { id: notificationId },
          data: { status: NotificationStatus.SENT, sentAt: new Date(), providerId },
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.error(`Falha ao enviar email para ${message.to}: ${error}`);
      if (notificationId) {
        await this.prisma.notification
          .update({ where: { id: notificationId }, data: { status: NotificationStatus.FAILED, error: error.slice(0, 500) } })
          .catch(() => undefined);
      }
    }
  }

  private async deliverStaffEmail(d: StaffNotifyData): Promise<void> {
    try {
      const staff = await this.prisma.user.findMany({
        where: {
          role: { in: [Role.ROOT, Role.MANAGER] },
          active: true,
          OR: [{ storeId: d.storeId }, { role: Role.ROOT }],
        },
        select: { email: true },
      });
      const emails = staff.map((s) => s.email);
      if (!emails.length) return;
      const msg = this.buildStaffEmail(d);
      await this.emailProvider.send({ ...msg, to: emails.join(', ') });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.logger.error(`Falha ao enviar email para equipe (loja ${d.storeId}): ${error}`);
    }
  }
}
