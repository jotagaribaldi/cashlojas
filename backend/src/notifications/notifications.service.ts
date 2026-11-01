import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationStatus } from '@prisma/client';
import { formatBRL } from '../common/utils/money';
import { formatDateBR } from '../common/utils/dates';
import { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { WHATSAPP_PROVIDER, WhatsAppMessage, WhatsAppProvider } from './whatsapp.provider';

export interface PurchaseMessageData {
  customerId: string;
  customerName: string;
  phone: string;
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
  storeName: string;
  activationUrl: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('Notifications');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
  ) {}

  buildPurchaseText(d: PurchaseMessageData): string {
    const firstName = d.customerName.split(' ')[0];
    return [
      `Olá, ${firstName}! Obrigado por comprar na ${d.storeName}.`,
      ``,
      `Data da compra: ${formatDateBR(d.purchaseDate)}`,
      `Valor pago: ${formatBRL(d.amountCents)}`,
      `Cashback desta compra: ${formatBRL(d.cashbackCents)}`,
      `Saldo de cashback acumulado: ${formatBRL(d.balanceCents)}`,
      `Validade deste cashback: ${formatDateBR(d.expiresAt, this.config.get('BUSINESS_UTC_OFFSET', { infer: true }))}`,
      ``,
      `Volte até a data de validade e use seu crédito como desconto na próxima compra.`,
    ].join('\n');
  }

  buildRedemptionText(d: RedemptionMessageData): string {
    const firstName = d.customerName.split(' ')[0];
    return [
      `Olá, ${firstName}! Você utilizou ${formatBRL(d.discountCents)} de cashback na ${d.storeName}.`,
      `Autorização: ${d.authorizationCode}`,
      `Saldo de cashback restante: ${formatBRL(d.balanceCents)}`,
    ].join('\n');
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

  notifyWelcome(d: WelcomeMessageData): void {
    const template = this.config.get('WHATSAPP_META_TEMPLATE_WELCOME', { infer: true });
    this.dispatch(d.customerId, {
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
  }

  notifyPurchase(d: PurchaseMessageData): void {
    const template = this.config.get('WHATSAPP_META_TEMPLATE_PURCHASE', { infer: true });
    const offset = this.config.get('BUSINESS_UTC_OFFSET', { infer: true });
    this.dispatch(d.customerId, {
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
  }

  notifyRedemption(d: RedemptionMessageData): void {
    const template = this.config.get('WHATSAPP_META_TEMPLATE_REDEMPTION', { infer: true });
    this.dispatch(d.customerId, {
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
  }

  private dispatch(customerId: string, message: WhatsAppMessage): void {
    void this.deliver(customerId, message);
  }

  private async deliver(customerId: string, message: WhatsAppMessage): Promise<void> {
    let notificationId: string | undefined;
    try {
      const notification = await this.prisma.notification.create({
        data: { customerId, to: message.to, body: message.storedText ?? message.text },
      });
      notificationId = notification.id;
      const { providerId } = await this.provider.send(message);
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
}
