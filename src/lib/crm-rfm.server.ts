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
const RFM_UPDATE_CHUNK_SIZE = 120;
const RFM_UPDATE_CONCURRENCY = 6;

type CustomerRFMState = {
  id: string;
  rfmSegment: string | null;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Lê TODOS os clientes de forma estável e também carrega o segmento persistido atual.
 * O segmento atual é usado para evitar regravar milhares de linhas que já estão corretas.
 */
async function loadCustomerStates(): Promise<CustomerRFMState[]> {
  const db = await admin();
  const rows: CustomerRFMState[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("shopify_customers")
      .select("id, rfm_segment")
      .order("id", { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Erro ao buscar clientes para RFM: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data.map((c) => ({ id: String(c.id), rfmSegment: c.rfm_segment ?? null })));
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

function mapOrderRows(data: any[], hasCancelledAt: boolean): ValidOrder[] {
  const orders: ValidOrder[] = [];
  for (const o of data) {
    if (!o.customer_id) continue;
    orders.push({
      customerId: String(o.customer_id),
      totalPrice: Number(o.total_price ?? 0),
      processedAt: String(o.processed_at ?? o.created_at ?? ""),
      financialStatus: o.financial_status,
      cancelledAt: hasCancelledAt ? (o.cancelled_at ?? null) : null,
    });
  }
  return orders;
}

/**
 * Lê TODOS os pedidos (paginado). A consulta principal usa `cancelled_at`.
 * Existe um fallback sem essa coluna para impedir que um snapshot de schema defasado
 * derrube toda a análise RFM; nesse caso a regra de status financeiro continua ativa.
 */
async function loadOrders(): Promise<ValidOrder[]> {
  const db = await admin();
  const orders: ValidOrder[] = [];
  let useCancelledAt = true;

  for (let page = 0; ; page++) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let data: any[] | null = null;

    if (useCancelledAt) {
      const primary = await (db.from("shopify_orders") as any)
        .select("id, customer_id, total_price, processed_at, created_at, financial_status, cancelled_at")
        .order("id", { ascending: true })
        .range(from, to);

      if (!primary.error) {
        data = primary.data as any[] | null;
      } else {
        console.warn(`[RFM] Consulta com cancelled_at falhou; tentando fallback compatível: ${primary.error.message}`);
        useCancelledAt = false;
      }
    }

    if (!useCancelledAt) {
      const fallback = await (db.from("shopify_orders") as any)
        .select("id, customer_id, total_price, processed_at, created_at, financial_status")
        .order("id", { ascending: true })
        .range(from, to);
      if (fallback.error) throw new Error(`Erro ao buscar pedidos para RFM: ${fallback.error.message}`);
      data = fallback.data as any[] | null;
    }

    if (!data || data.length === 0) break;
    orders.push(...mapOrderRows(data, useCancelledAt));
    if (data.length < PAGE_SIZE) break;
  }

  return orders;
}

export type RFMSnapshot = {
  customers: ScoredCustomer[];
  historyDays: number;
  classicMode: boolean;
  orders: ValidOrder[];
  customerSegments: Map<string, string | null>;
  sourceCustomerCount: number;
};

export async function buildRFMSnapshot(now: Date = new Date()): Promise<RFMSnapshot> {
  const [customerStates, orders] = await Promise.all([loadCustomerStates(), loadOrders()]);
  const customerIds = customerStates.map((customer) => customer.id);
  const customerSegments = new Map(customerStates.map((customer) => [customer.id, customer.rfmSegment]));
  const { customers, historyDays, classicMode } = computeRFM(customerIds, orders, now);
  return {
    customers,
    historyDays,
    classicMode,
    orders,
    customerSegments,
    sourceCustomerCount: customerStates.length,
  };
}

async function runWithConcurrency(tasks: Array<() => Promise<number>>, concurrency = RFM_UPDATE_CONCURRENCY): Promise<number> {
  if (tasks.length === 0) return 0;
  let next = 0;
  let updated = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= tasks.length) break;
      updated += await tasks[index]!();
    }
  });
  await Promise.all(workers);
  return updated;
}

/**
 * Persiste somente clientes cuja classificação mudou. Isso reduz drasticamente o tempo
 * do recálculo em bases maiores e evita timeouts do Worker causados por dezenas de UPDATEs
 * sequenciais. Se `currentSegments` não for informado, mantém compatibilidade e atualiza todos.
 */
export async function persistRFMSegments(
  customers: ScoredCustomer[],
  currentSegments?: Map<string, string | null>,
): Promise<number> {
  const db = await admin();
  const bySegment = new Map<RFMSegment, string[]>();
  const changedAt = new Date().toISOString();

  for (const customer of customers) {
    // Não tenta criar clientes órfãos vindos de pedidos antigos: RFM só atualiza a base de clientes existente.
    if (currentSegments && !currentSegments.has(customer.customerId)) continue;
    if (currentSegments && currentSegments.get(customer.customerId) === customer.segment) continue;
    const ids = bySegment.get(customer.segment) ?? [];
    ids.push(customer.customerId);
    bySegment.set(customer.segment, ids);
  }

  const tasks: Array<() => Promise<number>> = [];
  for (const [segment, ids] of bySegment) {
    for (let i = 0; i < ids.length; i += RFM_UPDATE_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + RFM_UPDATE_CHUNK_SIZE);
      tasks.push(async () => {
        const { data, error } = await db
          .from("shopify_customers")
          .update({ rfm_segment: segment, rfm_segment_changed_at: changedAt } as never)
          .in("id", chunk)
          .select("id");
        if (error) throw new Error(`Erro ao gravar segmento RFM ${segment}: ${error.message}`);
        return data?.length ?? 0;
      });
    }
  }

  return runWithConcurrency(tasks);
}

/** Recalcula e grava. Reutilizado pelo botão do painel e pela rotina diária. */
export async function recalculateRFM(now: Date = new Date()) {
  const snapshot = await buildRFMSnapshot(now);
  const validOrders = snapshot.orders.filter(isRevenueValidOrder);
  const buyers = snapshot.customers.filter((customer) => customer.frequency > 0).length;
  const changedCandidates = snapshot.customers.filter(
    (customer) => snapshot.customerSegments.has(customer.customerId)
      && snapshot.customerSegments.get(customer.customerId) !== customer.segment,
  ).length;
  const updated = await persistRFMSegments(snapshot.customers, snapshot.customerSegments);

  return {
    success: true as const,
    count: updated,
    changedCandidates,
    evaluatedCustomers: snapshot.sourceCustomerCount,
    buyers,
    sourceOrders: snapshot.orders.length,
    validOrders: validOrders.length,
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
  /** Média de dias desde a última compra válida dentro do segmento. */
  recenciaMediaDias: number | null;
  /** Mediana de dias desde a última compra válida dentro do segmento. */
  recenciaMedianaDias: number | null;
};

export async function getRFMStatsData(now: Date = new Date()) {
  // O comparativo mensal usa o mesmo universo de clientes/pedidos e recalcula a classificação
  // como ela seria conhecida no fechamento do mês anterior. Assim, não dependemos de um
  // histórico persistido de snapshots para mostrar a evolução da distribuição.
  const [customerStates, orders] = await Promise.all([loadCustomerStates(), loadOrders()]);
  const customerIds = customerStates.map((customer) => customer.id);
  const customerSegments = new Map(customerStates.map((customer) => [customer.id, customer.rfmSegment]));
  const currentComputed = computeRFM(customerIds, orders, now);
  const previousMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));
  const previousComputed = computeRFM(customerIds, orders, previousMonthEnd);
  const snapshot = {
    customers: currentComputed.customers,
    historyDays: currentComputed.historyDays,
    classicMode: currentComputed.classicMode,
    orders,
    customerSegments,
    sourceCustomerCount: customerStates.length,
  };
  const { customers, historyDays, classicMode } = snapshot;

  const activeSegments = Object.keys(RFM_SEGMENTS_CONFIG) as RFMSegment[];

  const acc = new Map<RFMSegment, { clientes: number; pedidos: number; receita: number; tenure: number[]; recencia: number[] }>();
  for (const seg of activeSegments) acc.set(seg, { clientes: 0, pedidos: 0, receita: 0, tenure: [], recencia: [] });

  for (const c of customers) {
    const bucket = acc.get(c.segment) ?? { clientes: 0, pedidos: 0, receita: 0, tenure: [], recencia: [] };
    bucket.clientes += 1;
    bucket.pedidos += c.frequency;
    bucket.receita += c.monetary;
    if (c.tenureDays !== null) bucket.tenure.push(c.tenureDays);
    if (c.recency !== null) bucket.recencia.push(c.recency);
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
    recenciaMediaDias: m.recencia.length > 0 ? m.recencia.reduce((a, b) => a + b, 0) / m.recencia.length : null,
    recenciaMedianaDias: m.recencia.length > 0
      ? [...m.recencia].sort((a, b) => a - b)[Math.floor((m.recencia.length - 1) / 2)]!
      : null,
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

  const validOrders = orders.filter(isRevenueValidOrder);
  const invalidOrders = orders.filter((o) => !isRevenueValidOrder(o));

  const previousCounts = new Map<RFMSegment, number>();
  for (const seg of activeSegments) previousCounts.set(seg, 0);
  for (const customer of previousComputed.customers) {
    previousCounts.set(customer.segment, (previousCounts.get(customer.segment) ?? 0) + 1);
  }
  const previousTotal = previousComputed.customers.length;
  const previousByCustomer = new Map(previousComputed.customers.map((customer) => [customer.customerId, customer.segment]));
  const transitionCounts = new Map<string, { from: RFMSegment; to: RFMSegment; clientes: number }>();
  for (const customer of currentComputed.customers) {
    const from = previousByCustomer.get(customer.customerId);
    if (!from || from === customer.segment) continue;
    const key = `${from} → ${customer.segment}`;
    const existing = transitionCounts.get(key);
    if (existing) existing.clientes += 1;
    else transitionCounts.set(key, { from, to: customer.segment, clientes: 1 });
  }
  const segmentTransitions = [...transitionCounts.values()]
    .sort((a, b) => b.clientes - a.clientes)
    .slice(0, 20);

  const monthlyComparison = activeSegments.map((segment) => {
    const currentClients = acc.get(segment)?.clientes ?? 0;
    const previousClients = previousCounts.get(segment) ?? 0;
    const currentPct = totalClientes > 0 ? (currentClients / totalClientes) * 100 : 0;
    const previousPct = previousTotal > 0 ? (previousClients / previousTotal) * 100 : 0;
    return {
      name: segment,
      currentPct,
      previousPct,
      deltaPp: currentPct - previousPct,
      currentClients,
      previousClients,
    };
  });

  return {
    summary,
    monthlyComparison,
    segmentTransitions,
    comparisonPeriod: {
      currentMonth: new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(now),
      previousMonth: new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(previousMonthEnd),
    },
    totalClientes,
    totalReceita,
    totalPedidos,
    compradores: customers.filter((c) => c.frequency > 0).length,
    aovGeral: totalPedidos > 0 ? totalReceita / totalPedidos : 0,
    historyDays,
    classicMode,
    sourceCustomers: snapshot.sourceCustomerCount,
    sourceOrders: orders.length,
    validOrders: validOrders.length,
    /** LTV projetado NÃO é calculado: histórico insuficiente. UI mostra "LTV indisponível". */
    ltvDisponivel: classicMode,
    frequencia: Object.entries(buckets).map(([faixa, v]) => ({ faixa, ...v })),
    receitaExcluida: invalidOrders.reduce((s, o) => s + o.totalPrice, 0),
    pedidosExcluidos: invalidOrders.length,
  };
}


export type RFMAnalysisAI = {
  executiveSummary: string;
  currentSituation: string;
  positiveSignals: string[];
  attentionPoints: string[];
  opportunities: string[];
  actionPlan: Array<{ horizon: string; title: string; action: string; target: string }>;
  metricHighlights: Array<{ metric: string; value: string; interpretation: string }>;
  caveats: string[];
};

function buildRFMAnalysisPrompt(data: Awaited<ReturnType<typeof getRFMStatsData>>): string {
  const compact = {
    periodo: data.comparisonPeriod,
    base: {
      clientes: data.totalClientes,
      compradores: data.compradores,
      receita: data.totalReceita,
      pedidosPagos: data.totalPedidos,
      aov: data.aovGeral,
      historicoDias: data.historyDays,
    },
    segmentos: data.summary.map((s) => ({
      nome: s.name,
      clientes: s.clientes,
      pctBase: s.pctBase,
      receita: s.receita,
      pctReceita: s.pctReceita,
      frequenciaMedia: s.frequenciaMedia,
      receitaPorCliente: s.receitaPorCliente,
      recenciaMediaDias: s.recenciaMediaDias,
      recenciaMedianaDias: s.recenciaMedianaDias,
      tempoDeBaseMedioDias: s.tenureMedioDias,
    })),
    comparacaoMensal: data.monthlyComparison,
    movimentosDeSegmento: data.segmentTransitions,
    frequencia: data.frequencia,
    receitaExcluida: data.receitaExcluida,
    pedidosExcluidos: data.pedidosExcluidos,
  };

  return `Você é um analista sênior de CRM e RFM de um e-commerce brasileiro de moda feminina.
Analise os dados abaixo e produza uma leitura EXECUTIVA, objetiva e acionável da Matriz RFM.

REGRAS IMPORTANTES:
- Use somente os números fornecidos. Não invente clientes, receita, taxas, causas ou resultados.
- Explique Recência em DIAS sempre que for relevante. Menor recência = compra mais recente.
- Diferencie "participação da base" de "quantidade de clientes". A variação mensal está em pontos percentuais (pp).
- Não trate uma queda de segmento como perda de clientes sem evidência: clientes podem ter mudado de classificação.
- Quando sugerir uma ação, diga explicitamente qual segmento deve receber a ação e em qual horizonte.
- Não prometa resultado. Sugira hipóteses testáveis.
- Considere que o mês atual pode estar incompleto e que o mês anterior é um snapshot no fechamento do calendário anterior.
- A análise deve ajudar a decidir onde agir primeiro, mas não use rankings artificiais ou notas.

Entregue JSON estrito neste formato:
{
  "executiveSummary": "3-5 frases com o diagnóstico principal",
  "currentSituation": "1 parágrafo explicando como está a base hoje, citando números relevantes e dias de recência",
  "positiveSignals": ["3-5 sinais positivos sustentados pelos dados"],
  "attentionPoints": ["3-5 pontos que merecem atenção, sempre com número/dias quando possível"],
  "opportunities": ["3-5 oportunidades práticas derivadas dos segmentos"],
  "actionPlan": [
    {"horizon":"0-7 dias","title":"...","action":"...","target":"segmento + critério em dias quando aplicável"},
    {"horizon":"8-30 dias","title":"...","action":"...","target":"..."},
    {"horizon":"31-60 dias","title":"...","action":"..."}
  ],
  "metricHighlights": [
    {"metric":"Recência","value":"...","interpretation":"..."},
    {"metric":"Frequência","value":"...","interpretation":"..."},
    {"metric":"Receita","value":"...","interpretation":"..."},
    {"metric":"Movimento mensal","value":"...","interpretation":"..."}
  ],
  "caveats": ["1-3 limitações ou cuidados de interpretação"]
}

DADOS RFM:
${JSON.stringify(compact)}`;
}

export async function generateRFMAnalysisAI(now: Date = new Date()): Promise<RFMAnalysisAI> {
  const db = await admin();
  const { data: settings, error: settingsError } = await db
    .from("store_settings")
    .select("openai_api_key")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (settingsError) throw new Error(`Não foi possível carregar a configuração da IA: ${settingsError.message}`);
  const apiKey = (settings as any)?.openai_api_key as string | undefined;
  if (!apiKey) throw new Error("Configure a API key da OpenAI em Configurações antes de gerar a análise RFM.");

  const data = await getRFMStatsData(now);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Você é um analista de CRM/RFM. Responda somente JSON válido, sem markdown." },
        { role: "user", content: buildRFMAnalysisPrompt(data) },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI respondeu ${response.status}: ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("A IA não retornou uma análise.");
  let parsed: RFMAnalysisAI;
  try {
    parsed = JSON.parse(content) as RFMAnalysisAI;
  } catch {
    throw new Error("A IA retornou uma resposta que não pôde ser interpretada.");
  }

  if (!parsed.executiveSummary || !Array.isArray(parsed.positiveSignals) || !Array.isArray(parsed.actionPlan)) {
    throw new Error("A análise da IA veio incompleta. Tente gerar novamente.");
  }
  return parsed;
}
