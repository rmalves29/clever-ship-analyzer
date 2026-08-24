/**
 * Motor de métricas comerciais do Dashboard CRM — lógica PURA (sem banco), testável.
 *
 * REGRA CENTRAL DE PEDIDO VÁLIDO (única no projeto):
 * a mesma de `crm-rfm-shared.ts` — só entram pedidos PAGOS (`PAID`, `PARTIALLY_PAID`)
 * e não cancelados. Ficam de fora `REFUNDED`, `PARTIALLY_REFUNDED`, `EXPIRED`, `VOIDED`,
 * `CANCELLED`/`CANCELED`, `PENDING`, `AUTHORIZED`, `UNPAID` e qualquer pedido com
 * `cancelled_at`/`cancelledAt` preenchido. Nenhum relatório deve reimplementar essa regra.
 */

import { isRevenueValidOrder, VALID_FINANCIAL_STATUSES } from "./crm-rfm-shared";

export { VALID_FINANCIAL_STATUSES };

/** Amostra mínima para exibir percentuais sem induzir a erro. */
export const MIN_SAMPLE = 5;
/** Dias de histórico pago necessários para métricas de churn/retenção maduras. */
export const MATURE_HISTORY_DAYS = 90;

export type OrderRow = {
  id?: string | null;
  customer_id?: string | null;
  total_price?: number | string | null;
  processed_at?: string | null;
  created_at?: string | null;
  province?: string | null;
  financial_status?: string | null;
  landing_site?: string | null;
  cancelled_at?: string | null;
  raw_data?: any;
};

/** Único ponto de verdade para "esse pedido conta como receita?". */
export function isValidCommercialOrder(order: OrderRow): boolean {
  const cancelledAt =
    order.cancelled_at ??
    (order.raw_data && typeof order.raw_data === "object" ? (order.raw_data.cancelledAt ?? null) : null);
  return isRevenueValidOrder({
    financialStatus: order.financial_status ?? null,
    cancelledAt: cancelledAt ?? null,
  });
}

export function filterValidOrders<T extends OrderRow>(orders: T[]): T[] {
  return orders.filter(isValidCommercialOrder);
}

export function orderDate(order: OrderRow): number {
  const raw = order.processed_at ?? order.created_at;
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

const money = (v: unknown) => Number(v ?? 0) || 0;
const round1 = (v: number) => Number(v.toFixed(1));

/* ------------------------------------------------------------------ KPIs */

export type CommercialKpis = {
  faturamento: number;
  numPedidos: number;
  ticketMedio: number;
  uniqueCustomers: number;
  receitaPorCliente: number;
};

export function computeCommercialKpis(validOrders: OrderRow[]): CommercialKpis {
  const faturamento = validOrders.reduce((a, o) => a + money(o.total_price), 0);
  const numPedidos = validOrders.length;
  const uniqueCustomers = new Set(validOrders.map((o) => o.customer_id).filter(Boolean)).size;
  return {
    faturamento,
    numPedidos,
    ticketMedio: numPedidos > 0 ? faturamento / numPedidos : 0,
    uniqueCustomers,
    receitaPorCliente: uniqueCustomers > 0 ? faturamento / uniqueCustomers : 0,
  };
}

/* -------------------------------------------------- agregado por cliente */

export type CustomerAgg = {
  customerId: string;
  dates: number[];
  total: number;
  count: number;
  province: string | null;
};

/** Agrega SOMENTE pedidos válidos por cliente, com datas ordenadas. */
export function buildCustomerAggregates(orders: OrderRow[]): CustomerAgg[] {
  const map = new Map<string, CustomerAgg>();
  for (const o of filterValidOrders(orders)) {
    const key = o.customer_id;
    if (!key) continue;
    const agg = map.get(key) ?? { customerId: key, dates: [], total: 0, count: 0, province: o.province ?? null };
    agg.dates.push(orderDate(o));
    agg.total += money(o.total_price);
    if (!agg.province && o.province) agg.province = o.province;
    map.set(key, agg);
  }
  return Array.from(map.values()).map((c) => ({
    ...c,
    dates: c.dates.sort((a, b) => a - b),
    count: c.dates.length,
  }));
}

export const FREQUENCY_BUCKETS = [
  { name: "1x", match: (n: number) => n === 1 },
  { name: "2x", match: (n: number) => n === 2 },
  { name: "3x", match: (n: number) => n === 3 },
  { name: "4x+", match: (n: number) => n >= 4 },
] as const;

/** 01 — % de clientes por número de compras VÁLIDAS. */
export function computeFrequencyDistribution(customers: CustomerAgg[]) {
  const total = customers.length;
  return FREQUENCY_BUCKETS.map((b) => {
    const n = customers.filter((c) => b.match(c.count)).length;
    return { name: b.name, value: total > 0 ? round1((n / total) * 100) : 0, clientes: n };
  });
}

/** 02 — valor acumulado observado por cliente (NÃO é LTV preditivo). */
export function computeValorAcumulado(customers: CustomerAgg[]) {
  return FREQUENCY_BUCKETS.map((b) => {
    const g = customers.filter((c) => b.match(c.count));
    const avg = g.length ? g.reduce((a, c) => a + c.total, 0) / g.length : 0;
    return { name: b.name, value: Number(avg.toFixed(2)), clientes: g.length };
  });
}

/** 03 — ticket médio por pedido dentro de cada faixa de recorrência. */
export function computeTicketRecorrencia(customers: CustomerAgg[]) {
  const rows = FREQUENCY_BUCKETS.map((b, i) => {
    const g = customers.filter((c) => b.match(c.count));
    const pedidos = g.reduce((a, c) => a + c.count, 0);
    const ticket = pedidos > 0 ? g.reduce((a, c) => a + c.total, 0) / pedidos : 0;
    return {
      label: `${b.name} compra${i === 0 ? "" : "s"}`,
      clientes: g.length,
      ticket: Number(ticket.toFixed(2)),
      delta: null as number | null,
    };
  });
  // Delta só entre faixas que realmente têm clientes — comparar contra faixa vazia gera -100% falso.
  let prev: number | null = null;
  for (const row of rows) {
    if (row.clientes === 0) continue;
    if (prev !== null && prev > 0) row.delta = round1(((row.ticket - prev) / prev) * 100);
    prev = row.ticket;
  }
  return rows;
}

export const TICKET_BANDS = [
  { name: "< R$100", min: 0, max: 100 },
  { name: "R$100-200", min: 100, max: 200 },
  { name: "R$200-400", min: 200, max: 400 },
  { name: "R$400-800", min: 400, max: 800 },
  { name: "R$800+", min: 800, max: Infinity },
] as const;

/** 04 — distribuição dos PEDIDOS válidos por faixa de valor do pedido. */
export function computeFaixaTicket(validOrders: OrderRow[]) {
  const total = validOrders.length;
  return TICKET_BANDS.map((f) => {
    const n = validOrders.filter((o) => {
      const v = money(o.total_price);
      return v >= f.min && v < f.max;
    }).length;
    return { name: f.name, value: total > 0 ? round1((n / total) * 100) : 0, pedidos: n };
  });
}

/** 05 — taxa de recompra POR ESTADO (denominador = clientes daquele estado). */
export function computeRegioesRecompra(customers: CustomerAgg[], minSample = MIN_SAMPLE) {
  const byUf = new Map<string, { total: number; repeat: number }>();
  for (const c of customers) {
    if (!c.province) continue;
    const slot = byUf.get(c.province) ?? { total: 0, repeat: 0 };
    slot.total += 1;
    if (c.count >= 2) slot.repeat += 1;
    byUf.set(c.province, slot);
  }
  return Array.from(byUf.entries())
    .filter(([, s]) => s.total >= minSample)
    .map(([name, s]) => ({
      name,
      value: round1((s.repeat / s.total) * 100),
      clientes: s.total,
      recompraram: s.repeat,
    }))
    .sort((a, b) => b.value - a.value || b.clientes - a.clientes)
    .slice(0, 5);
}

/** 06 — retenção observada por estágio: % que avançou da Nª para a (N+1)ª compra válida. */
export function computeRetencaoPorEstagio(customers: CustomerAgg[]) {
  return [1, 2, 3].map((n) => {
    const reached = customers.filter((c) => c.count >= n).length;
    const advanced = customers.filter((c) => c.count >= n + 1).length;
    return {
      name: `${n}ª → ${n + 1}ª compra`,
      value: reached > 0 ? round1((advanced / reached) * 100) : 0,
      base: reached,
      avancaram: advanced,
    };
  });
}

export const GAP_BUCKETS = [
  { name: "< 15d", match: (d: number) => d < 15 },
  { name: "15-60d", match: (d: number) => d >= 15 && d <= 60 },
  { name: "61-90d", match: (d: number) => d > 60 && d <= 90 },
  { name: "> 90d", match: (d: number) => d > 90 },
] as const;

/** Intervalos em dias entre 1ª e 2ª compra válidas. */
export function computeGapsPrimeiraSegunda(customers: CustomerAgg[]): number[] {
  return customers
    .filter((c) => c.count >= 2)
    .map((c) => (c.dates[1]! - c.dates[0]!) / 86_400_000)
    .filter((d) => Number.isFinite(d) && d >= 0);
}

/** 07 — distribuição do intervalo 1ª→2ª compra (faixas mutuamente exclusivas). */
export function computeTempoEntreCompras(gaps: number[]) {
  return GAP_BUCKETS.map((b) => ({
    name: b.name,
    value: gaps.length ? round1((gaps.filter(b.match).length / gaps.length) * 100) : 0,
    clientes: gaps.filter(b.match).length,
  }));
}

export const WEEK_BANDS = [
  { name: "Semana 1-4", min: 0, max: 28 },
  { name: "Semana 5-8", min: 28, max: 56 },
  { name: "Semana 9-12", min: 56, max: 84 },
  { name: "Semana 13+", min: 84, max: Infinity },
] as const;

/** 08 — em que faixa de semanas a 2ª compra aconteceu (faixas exclusivas, somam 100%). */
export function computeCurvaRecompra(gaps: number[]) {
  return WEEK_BANDS.map((b) => {
    const n = gaps.filter((d) => d >= b.min && d < b.max).length;
    return { name: b.name, value: gaps.length ? round1((n / gaps.length) * 100) : 0, clientes: n };
  });
}

/** 14 — taxa de recompra: % dos clientes com pedido válido que fizeram 2+ compras válidas. */
export function computeTaxaRecompra(customers: CustomerAgg[]) {
  const base = customers.length;
  const recompras = customers.filter((c) => c.count >= 2).length;
  return {
    taxaRecompra: base > 0 ? Number(((recompras / base) * 100).toFixed(2)) : 0,
    recomprasCount: recompras,
    baseClientes: base,
  };
}

/* -------------------------------------------------------------- envios */

export type FulfillmentRow = {
  order_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  tracking_number?: string | null;
};

/**
 * 10 — primeiro envio por pedido. Usa `created_at` do fulfillment (momento em que o envio
 * foi criado na Shopify), NUNCA `updated_at` (atualização posterior de rastreio).
 */
export function buildFirstFulfillmentByOrder(
  fulfillments: FulfillmentRow[],
  processedAtByOrder: Map<string, string | null>,
) {
  const first = new Map<string, { at: number; processedAt: number | null }>();
  for (const f of fulfillments) {
    const orderId = f.order_id;
    const atRaw = f.created_at ?? f.updated_at;
    if (!orderId || !atRaw) continue;
    const at = new Date(atRaw).getTime();
    if (Number.isNaN(at)) continue;
    const p = processedAtByOrder.get(orderId) ?? null;
    const processedAt = p ? new Date(p).getTime() : null;
    const cur = first.get(orderId);
    if (!cur || at < cur.at) first.set(orderId, { at, processedAt: Number.isNaN(processedAt as number) ? null : processedAt });
  }
  return first;
}

/** Tempo médio pagamento → primeiro envio, descartando valores negativos/anômalos. */
export function computeTempoMedioEnvio(first: Map<string, { at: number; processedAt: number | null }>) {
  const horas: number[] = [];
  first.forEach(({ at, processedAt }) => {
    if (processedAt === null) return;
    const h = (at - processedAt) / 3_600_000;
    if (h < 0 || h > 24 * 90) return; // negativos e outliers absurdos ficam fora
    horas.push(h);
  });
  const media = horas.length ? horas.reduce((a, h) => a + h, 0) / horas.length : 0;
  return { tempoMedioEnvioHoras: media, tempoMedioEnvioDias: media / 24, amostra: horas.length };
}

/* ------------------------------------------------------------- coorte */

/** 11 — coorte por mês de 1ª compra válida. Meses sem coorte retornam `size: 0` e retenção nula. */
export function computeCohort(
  customers: CustomerAgg[],
  months: { start: number; end: number; label: string }[],
) {
  return months.map((m) => {
    const firstTimers = customers.filter((c) => {
      const f = c.dates[0];
      return f !== undefined && f >= m.start && f <= m.end;
    });
    const size = firstTimers.length;
    const retention = months.map((target) => {
      if (target.start < m.start) return null;
      if (size === 0) return null; // sem coorte não existe retenção 0%, existe "sem dados"
      const returned = firstTimers.filter((c) => c.dates.some((d) => d >= target.start && d <= target.end)).length;
      return round1((returned / size) * 100);
    });
    return { month: m.label, size, retention };
  });
}

/** 12 — pedidos por página de entrada (landing_site do pedido; NÃO é sessão). */
export function computePedidosPorLanding(validOrders: OrderRow[], limit = 10) {
  const counts = new Map<string, number>();
  for (const o of validOrders) {
    if (!o.landing_site) continue;
    const path = o.landing_site.replace(/^https?:\/\/[^/]+/, "") || "/";
    counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([page, count]) => ({ page, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Dias de histórico pago disponível (para decidir se churn/retenção é confiável). */
export function computeHistoryDaysFromOrders(validOrders: OrderRow[], now = Date.now()): number {
  const times = validOrders.map(orderDate).filter((t) => t > 0);
  if (!times.length) return 0;
  return Math.max(0, Math.floor((now - Math.min(...times)) / 86_400_000));
}
