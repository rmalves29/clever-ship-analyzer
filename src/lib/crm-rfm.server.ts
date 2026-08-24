import {
  computeRFM,
  frequencyBucket,
  isRevenueValidOrder,
  RFM_SEGMENTS_CONFIG,
  type RFMSegment,
  type ScoredCustomer,
  type ValidOrder,
} from "./crm-rfm-shared";

const PAGE_SIZE = 1000;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Lê TODOS os clientes (paginado) — nenhum registro é alterado além de `rfm_segment`. */
async function loadCustomerIds(): Promise<string[]> {
  const db = await admin();
  const ids: string[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("shopify_customers")
      .select("id")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Erro ao buscar clientes: ${error.message}`);
    if (!data || data.length === 0) break;
    ids.push(...data.map((c) => String(c.id)));
    if (data.length < PAGE_SIZE) break;
  }
  return ids;
}

/** Lê TODOS os pedidos (paginado). A filtragem por receita válida acontece na lógica pura. */
async function loadOrders(): Promise<ValidOrder[]> {
  const db = await admin();
  const orders: ValidOrder[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("shopify_orders")
      .select("customer_id, total_price, processed_at, created_at, financial_status")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Erro ao buscar pedidos: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const o of data) {
      if (!o.customer_id) continue;
      orders.push({
        customerId: String(o.customer_id),
        totalPrice: Number(o.total_price ?? 0),
        processedAt: String(o.processed_at ?? o.created_at ?? ""),
        financialStatus: o.financial_status,
      });
    }
    if (data.length < PAGE_SIZE) break;
  }
  return orders;
}

export type RFMSnapshot = {
  customers: ScoredCustomer[];
  historyDays: number;
  classicMode: boolean;
  orders: ValidOrder[];
};

export async function buildRFMSnapshot(now: Date = new Date()): Promise<RFMSnapshot> {
  const [customerIds, orders] = await Promise.all([loadCustomerIds(), loadOrders()]);
  const { customers, historyDays, classicMode } = computeRFM(customerIds, orders, now);
  return { customers, historyDays, classicMode, orders };
}

/** Persiste os segmentos em `shopify_customers.rfm_segment`. Só faz UPDATE — nunca apaga dados. */
export async function persistRFMSegments(customers: ScoredCustomer[]): Promise<number> {
  const db = await admin();
  const bySegment = new Map<RFMSegment, string[]>();
  for (const c of customers) {
    const list = bySegment.get(c.segment) ?? [];
    list.push(c.customerId);
    bySegment.set(c.segment, list);
  }

  let updated = 0;
  for (const [segment, ids] of bySegment) {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { error } = await db.from("shopify_customers").update({ rfm_segment: segment }).in("id", chunk);
      if (error) throw new Error(`Erro ao gravar segmento ${segment}: ${error.message}`);
      updated += chunk.length;
    }
  }
  return updated;
}

/** Recalcula e grava. Reutilizado pelo botão do painel e pela rotina diária. */
export async function recalculateRFM(now: Date = new Date()) {
  const snapshot = await buildRFMSnapshot(now);
  const updated = await persistRFMSegments(snapshot.customers);
  return {
    success: true as const,
    count: updated,
    historyDays: snapshot.historyDays,
    classicMode: snapshot.classicMode,
  };
}

export type SegmentSummaryRow = {
  name: RFMSegment;
  clientes: number;
  pctBase: number;
  pedidos: number;
  frequenciaMedia: number;
  receita: number;
  pctReceita: number;
  aov: number;
  /** Receita real acumulada por cliente do segmento (observada, NÃO é projeção de LTV). */
  receitaPorCliente: number;
  /** Média de dias desde a primeira compra válida (tempo de base observado). */
  tenureMedioDias: number | null;
};

export async function getRFMStatsData(now: Date = new Date()) {
  const snapshot = await buildRFMSnapshot(now);
  const { customers, historyDays, classicMode, orders } = snapshot;

  const activeSegments = (Object.keys(RFM_SEGMENTS_CONFIG) as RFMSegment[]).filter(
    (s) => classicMode || RFM_SEGMENTS_CONFIG[s].mode === "base",
  );

  const acc = new Map<RFMSegment, { clientes: number; pedidos: number; receita: number; tenure: number[] }>();
  for (const seg of activeSegments) acc.set(seg, { clientes: 0, pedidos: 0, receita: 0, tenure: [] });

  for (const c of customers) {
    const bucket = acc.get(c.segment) ?? { clientes: 0, pedidos: 0, receita: 0, tenure: [] };
    bucket.clientes += 1;
    bucket.pedidos += c.frequency;
    bucket.receita += c.monetary;
    if (c.tenureDays !== null) bucket.tenure.push(c.tenureDays);
    acc.set(c.segment, bucket);
  }

  const totalClientes = customers.length;
  const totalReceita = customers.reduce((s, c) => s + c.monetary, 0);
  const totalPedidos = customers.reduce((s, c) => s + c.frequency, 0);

  const summary: SegmentSummaryRow[] = Array.from(acc.entries()).map(([name, m]) => ({
    name,
    clientes: m.clientes,
    pctBase: totalClientes > 0 ? (m.clientes / totalClientes) * 100 : 0,
    pedidos: m.pedidos,
    frequenciaMedia: m.clientes > 0 ? m.pedidos / m.clientes : 0,
    receita: m.receita,
    pctReceita: totalReceita > 0 ? (m.receita / totalReceita) * 100 : 0,
    aov: m.pedidos > 0 ? m.receita / m.pedidos : 0,
    receitaPorCliente: m.clientes > 0 ? m.receita / m.clientes : 0,
    tenureMedioDias: m.tenure.length > 0 ? m.tenure.reduce((a, b) => a + b, 0) / m.tenure.length : null,
  }));

  const buckets: Record<string, { clientes: number; receita: number }> = {
    "0x": { clientes: 0, receita: 0 },
    "1x": { clientes: 0, receita: 0 },
    "2x": { clientes: 0, receita: 0 },
    "3x": { clientes: 0, receita: 0 },
    "4x+": { clientes: 0, receita: 0 },
  };
  for (const c of customers) {
    const b = buckets[frequencyBucket(c.frequency)]!;
    b.clientes += 1;
    b.receita += c.monetary;
  }

  const invalidOrders = orders.filter((o) => !isRevenueValidOrder(o));

  return {
    summary,
    totalClientes,
    totalReceita,
    totalPedidos,
    compradores: customers.filter((c) => c.frequency > 0).length,
    aovGeral: totalPedidos > 0 ? totalReceita / totalPedidos : 0,
    historyDays,
    classicMode,
    /** LTV projetado NÃO é calculado: histórico insuficiente. UI mostra "LTV indisponível". */
    ltvDisponivel: classicMode,
    frequencia: Object.entries(buckets).map(([faixa, v]) => ({ faixa, ...v })),
    receitaExcluida: invalidOrders.reduce((s, o) => s + o.totalPrice, 0),
    pedidosExcluidos: invalidOrders.length,
  };
}
