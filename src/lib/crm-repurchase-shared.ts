import { isRevenueValidOrder } from "./crm-rfm-shared";

export type RepurchaseWindow = "0–7 dias" | "8–15 dias" | "16–30 dias" | "31–60 dias" | "61–90 dias" | "90+ dias";

export type RepurchaseOrder = {
  id: string;
  customerId: string;
  totalPrice: number;
  processedAt: string;
  financialStatus?: string | null;
  cancelledAt?: string | null;
};

export type RepurchaseCustomer = {
  customerId: string;
  firstOrderId: string;
  firstOrderAt: string;
  firstOrderRevenue: number;
  daysSinceFirstOrder: number;
  stage: RepurchaseWindow | "Convertido";
  converted: boolean;
  secondOrderId: string | null;
  secondOrderAt: string | null;
  secondOrderRevenue: number | null;
  daysToSecondOrder: number | null;
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

export function buildRepurchaseJourney(orders: RepurchaseOrder[], now = new Date()): RepurchaseCustomer[] {
  const valid = orders.filter((o) => isRevenueValidOrder({ financialStatus: o.financialStatus, cancelledAt: o.cancelledAt, processedAt: o.processedAt }));
  const byCustomer = new Map<string, RepurchaseOrder[]>();
  for (const order of valid) {
    if (!order.customerId || Number.isNaN(new Date(order.processedAt).getTime())) continue;
    const current = byCustomer.get(order.customerId) ?? [];
    current.push(order);
    byCustomer.set(order.customerId, current);
  }

  return [...byCustomer.entries()].map(([customerId, customerOrders]) => {
    const sorted = [...customerOrders].sort((a, b) => new Date(a.processedAt).getTime() - new Date(b.processedAt).getTime());
    const first = sorted[0]!;
    const second = sorted[1] ?? null;
    const firstDate = new Date(first.processedAt);
    const daysSinceFirstOrder = daysBetween(firstDate, now);
    return {
      customerId,
      firstOrderId: first.id,
      firstOrderAt: first.processedAt,
      firstOrderRevenue: Number(first.totalPrice || 0),
      daysSinceFirstOrder,
      stage: second ? "Convertido" : repurchaseWindow(daysSinceFirstOrder),
      converted: Boolean(second),
      secondOrderId: second?.id ?? null,
      secondOrderAt: second?.processedAt ?? null,
      secondOrderRevenue: second ? Number(second.totalPrice || 0) : null,
      daysToSecondOrder: second ? daysBetween(firstDate, new Date(second.processedAt)) : null,
    };
  });
}

export function summarizeRepurchase(journey: RepurchaseCustomer[]) {
  const buyers = journey.length;
  const convertedRows = journey.filter((x) => x.converted);
  const pendingRows = journey.filter((x) => !x.converted);
  const windows: Record<RepurchaseWindow, number> = {
    "0–7 dias": 0, "8–15 dias": 0, "16–30 dias": 0, "31–60 dias": 0, "61–90 dias": 0, "90+ dias": 0,
  };
  pendingRows.forEach((x) => { windows[x.stage as RepurchaseWindow] += 1; });
  const firstRevenue = journey.reduce((sum, x) => sum + x.firstOrderRevenue, 0);
  const secondRevenue = convertedRows.reduce((sum, x) => sum + (x.secondOrderRevenue ?? 0), 0);
  const avg = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  return {
    buyers,
    pending: pendingRows.length,
    converted: convertedRows.length,
    conversionRate: buyers ? convertedRows.length / buyers : 0,
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
  return [...map.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([month, rows]) => {
    const converted = rows.filter((x) => x.converted);
    return {
      month,
      customers: rows.length,
      converted: converted.length,
      conversionRate: rows.length ? converted.length / rows.length : 0,
      averageDaysToSecondOrder: converted.length ? converted.reduce((s, x) => s + (x.daysToSecondOrder ?? 0), 0) / converted.length : 0,
      secondOrderRevenue: converted.reduce((s, x) => s + (x.secondOrderRevenue ?? 0), 0),
    };
  });
}
