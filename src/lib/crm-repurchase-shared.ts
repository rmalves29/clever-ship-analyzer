import { isRevenueValidOrder } from "./crm-rfm-shared";

export const REPURCHASE_WINDOWS = [
  "0–7 dias",
  "8–15 dias",
  "16–30 dias",
  "31–60 dias",
  "61–90 dias",
  "90+ dias",
] as const;

export type RepurchaseWindow = (typeof REPURCHASE_WINDOWS)[number];

/** Meta inicial exibida no painel. Pode virar configuração persistida em uma fase futura. */
export const DEFAULT_REPURCHASE_TARGET = 0.15;

export type RepurchaseOrder = {
  id: string;
  customerId: string;
  totalPrice: number;
  processedAt: string;
  financialStatus?: string | null;
  cancelledAt?: string | null;
  sourceName?: string | null;
};

export type RepurchaseCustomer = {
  customerId: string;
  firstOrderId: string;
  firstOrderAt: string;
  firstOrderRevenue: number;
  firstOrderSourceName: string | null;
  daysSinceFirstOrder: number;
  stage: RepurchaseWindow | "Convertido";
  converted: boolean;
  secondOrderId: string | null;
  secondOrderAt: string | null;
  secondOrderRevenue: number | null;
  secondOrderSourceName: string | null;
  daysToSecondOrder: number | null;
};

export type RepurchaseAttributionEvidence =
  | "coupon"
  | "tracked_link"
  | "campaign_specific_landing"
  | "explicit_customer_reply"
  | "manual_verified";

export type RepurchaseAttributionRecord = {
  campaignId: string;
  customerId: string;
  stage: RepurchaseWindow;
  sentAt: string;
  convertedAt: string;
  orderId: string;
  revenue: number;
  conversionWindowDays: number;
  attributionEvidence: RepurchaseAttributionEvidence;
  attributionReference: string;
};

const DAY = 86_400_000;
const daysBetween = (a: Date, b: Date) => Math.max(0, Math.floor((b.getTime() - a.getTime()) / DAY));

export function repurchaseWindow(days: number): RepurchaseWindow {
  if (days <= 7) return "0–7 dias";
  if (days <= 15) return "8–15 dias";
  if (days <= 30) return "16–30 dias";
  if (days <= 60) return "31–60 dias";
  if (days <= 90) return "61–90 dias";
  return "90+ dias";
}

/**
 * Monta a jornada somente com pedidos válidos, reutilizando exatamente a regra do RFM.
 * IDs de pedido repetidos são deduplicados defensivamente para não inflar frequência/conversão.
 */
export function buildRepurchaseJourney(orders: RepurchaseOrder[], now = new Date()): RepurchaseCustomer[] {
  const seenOrderIds = new Set<string>();
  const valid = orders.filter((order) => {
    if (!order.id || seenOrderIds.has(order.id)) return false;
    const revenueValid = isRevenueValidOrder({
      financialStatus: order.financialStatus,
      cancelledAt: order.cancelledAt,
      processedAt: order.processedAt,
    });
    if (!revenueValid) return false;
    seenOrderIds.add(order.id);
    return true;
  });

  const byCustomer = new Map<string, RepurchaseOrder[]>();
  for (const order of valid) {
    if (!order.customerId || Number.isNaN(new Date(order.processedAt).getTime())) continue;
    const current = byCustomer.get(order.customerId) ?? [];
    current.push(order);
    byCustomer.set(order.customerId, current);
  }

  return [...byCustomer.entries()].map(([customerId, customerOrders]) => {
    const sorted = [...customerOrders].sort(
      (a, b) => new Date(a.processedAt).getTime() - new Date(b.processedAt).getTime(),
    );
    const first = sorted[0]!;
    const second = sorted[1] ?? null;
    const firstDate = new Date(first.processedAt);
    const daysSinceFirstOrder = daysBetween(firstDate, now);

    return {
      customerId,
      firstOrderId: first.id,
      firstOrderAt: first.processedAt,
      firstOrderRevenue: Number(first.totalPrice || 0),
      firstOrderSourceName: first.sourceName ?? null,
      daysSinceFirstOrder,
      stage: second ? "Convertido" : repurchaseWindow(daysSinceFirstOrder),
      converted: Boolean(second),
      secondOrderId: second?.id ?? null,
      secondOrderAt: second?.processedAt ?? null,
      secondOrderRevenue: second ? Number(second.totalPrice || 0) : null,
      secondOrderSourceName: second?.sourceName ?? null,
      daysToSecondOrder: second ? daysBetween(firstDate, new Date(second.processedAt)) : null,
    };
  });
}

export function summarizeRepurchase(journey: RepurchaseCustomer[], target = DEFAULT_REPURCHASE_TARGET) {
  const buyers = journey.length;
  const convertedRows = journey.filter((x) => x.converted);
  const pendingRows = journey.filter((x) => !x.converted);
  const windows: Record<RepurchaseWindow, number> = {
    "0–7 dias": 0,
    "8–15 dias": 0,
    "16–30 dias": 0,
    "31–60 dias": 0,
    "61–90 dias": 0,
    "90+ dias": 0,
  };

  pendingRows.forEach((x) => {
    windows[x.stage as RepurchaseWindow] += 1;
  });

  const firstRevenue = journey.reduce((sum, x) => sum + x.firstOrderRevenue, 0);
  const secondRevenue = convertedRows.reduce((sum, x) => sum + (x.secondOrderRevenue ?? 0), 0);
  const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
  const conversionRate = buyers ? convertedRows.length / buyers : 0;

  return {
    buyers,
    pending: pendingRows.length,
    converted: convertedRows.length,
    conversionRate,
    targetConversionRate: target,
    gapToTarget: Math.max(0, target - conversionRate),
    firstRevenue,
    firstAverageTicket: buyers ? firstRevenue / buyers : 0,
    secondRevenue,
    secondAverageTicket: convertedRows.length ? secondRevenue / convertedRows.length : 0,
    averageDaysToSecondOrder: avg(convertedRows.map((x) => x.daysToSecondOrder ?? 0)),
    averageDaysSinceFirstOrderPending: avg(pendingRows.map((x) => x.daysSinceFirstOrder)),
    windows,
  };
}

export function buildRepurchaseCohorts(journey: RepurchaseCustomer[]) {
  const map = new Map<string, RepurchaseCustomer[]>();
  for (const row of journey) {
    const month = row.firstOrderAt.slice(0, 7);
    const rows = map.get(month) ?? [];
    rows.push(row);
    map.set(month, rows);
  }

  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, rows]) => {
      const converted = rows.filter((x) => x.converted);
      return {
        month,
        customers: rows.length,
        converted: converted.length,
        conversionRate: rows.length ? converted.length / rows.length : 0,
        averageDaysToSecondOrder: converted.length
          ? converted.reduce((s, x) => s + (x.daysToSecondOrder ?? 0), 0) / converted.length
          : 0,
        secondOrderRevenue: converted.reduce((s, x) => s + (x.secondOrderRevenue ?? 0), 0),
      };
    });
}

/**
 * Atribuição só é aceita com evidência rastreável. Tempo após envio, sozinho, nunca é evidência.
 */
export function isAuditableAttribution(record: RepurchaseAttributionRecord): boolean {
  if (!record.campaignId || !record.customerId || !record.orderId || !record.attributionReference) return false;
  if (record.revenue < 0 || record.conversionWindowDays < 0) return false;
  const sent = new Date(record.sentAt);
  const converted = new Date(record.convertedAt);
  if (Number.isNaN(sent.getTime()) || Number.isNaN(converted.getTime()) || converted < sent) return false;
  return true;
}
