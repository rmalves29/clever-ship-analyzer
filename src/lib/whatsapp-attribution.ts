export const WHATSAPP_ATTRIBUTION_WINDOW_DAYS = 3;

export type CampaignDelivery = {
  campaignId: string;
  phone: string;
  status: string;
  sentAt: string | null;
};

/** Atribuição padrão sem cupom: primeiro contato nas 72 horas anteriores ao pedido. */
export function findFirstTouchCampaign(input: {
  orderPhone: string;
  orderAt: string | number | Date;
  deliveries: CampaignDelivery[];
  windowDays?: number;
}): string | null {
  const orderAt = new Date(input.orderAt).getTime();
  if (!Number.isFinite(orderAt)) return null;

  const windowMs = (input.windowDays ?? WHATSAPP_ATTRIBUTION_WINDOW_DAYS) * 24 * 60 * 60 * 1_000;
  let firstCampaignId: string | null = null;
  let firstSentAt = Infinity;

  for (const delivery of input.deliveries) {
    if (delivery.phone !== input.orderPhone || delivery.status === "failed" || !delivery.sentAt) continue;
    const sentAt = new Date(delivery.sentAt).getTime();
    if (!Number.isFinite(sentAt) || sentAt > orderAt || orderAt - sentAt > windowMs) continue;

    if (sentAt < firstSentAt || (sentAt === firstSentAt && delivery.campaignId < (firstCampaignId ?? "\uffff"))) {
      firstSentAt = sentAt;
      firstCampaignId = delivery.campaignId;
    }
  }

  return firstCampaignId;
}
