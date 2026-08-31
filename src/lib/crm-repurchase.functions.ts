import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";
import {
  buildRepurchaseCohorts,
  buildRepurchaseJourney,
  DEFAULT_REPURCHASE_TARGET,
  DEFAULT_REPURCHASE_TARGET_WINDOW_DAYS,
  REPURCHASE_WINDOWS,
  REPURCHASE_TARGET_WINDOWS,
  summarizeRepurchase,
  type RepurchaseCustomer,
  type RepurchaseTargetWindowDays,
  type RepurchaseWindow,
} from "./crm-repurchase-shared";

const PAGE_SIZE = 1000;
const repurchaseWindowSchema = z.enum(REPURCHASE_WINDOWS);

type CustomerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  province: string | null;
};

type OrderRow = {
  id: string;
  customer_id: string | null;
  total_price: number;
  processed_at: string | null;
  created_at: string;
  financial_status: string | null;
  cancelled_at: string | null;
  source_name: string | null;
  city: string | null;
  province: string | null;
};

type OrderItemRow = {
  order_id: string | null;
  title: string | null;
  variant_title: string | null;
  quantity: number | null;
};

async function loadAllOrders(): Promise<OrderRow[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows: OrderRow[] = [];

  for (let page = 0; ; page += 1) {
    const { data, error } = await supabaseAdmin
      .from("shopify_orders")
      .select("id,customer_id,total_price,processed_at,created_at,financial_status,cancelled_at,source_name,city,province")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Erro ao carregar pedidos da régua: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadAllCustomers(): Promise<CustomerRow[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows: CustomerRow[] = [];
  for (let page = 0; ; page += 1) {
    const { data, error } = await supabaseAdmin
      .from("shopify_customers")
      .select("id,first_name,last_name,city,province")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Erro ao carregar clientes da régua: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadItemsForOrders(orderIds: string[]): Promise<Map<string, OrderItemRow[]>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const map = new Map<string, OrderItemRow[]>();
  const uniqueIds = [...new Set(orderIds)].filter(Boolean);

  for (let i = 0; i < uniqueIds.length; i += 200) {
    const ids = uniqueIds.slice(i, i + 200);
    const { data, error } = await supabaseAdmin
      .from("shopify_order_items")
      .select("order_id,title,variant_title,quantity")
      .in("order_id", ids);
    if (error) throw new Error(`Erro ao carregar itens da régua: ${error.message}`);
    for (const item of data ?? []) {
      if (!item.order_id) continue;
      const current = map.get(item.order_id) ?? [];
      current.push(item);
      map.set(item.order_id, current);
    }
  }
  return map;
}

function productLabels(items: OrderItemRow[] | undefined): string[] {
  if (!items?.length) return [];
  return items.map((item) => {
    const variant = item.variant_title && item.variant_title !== "Default Title" ? ` — ${item.variant_title}` : "";
    const qty = Number(item.quantity ?? 1);
    return `${item.title ?? "Produto"}${variant}${qty > 1 ? ` ×${qty}` : ""}`;
  });
}

async function loadRepurchaseData() {
  const [orders, customers] = await Promise.all([loadAllOrders(), loadAllCustomers()]);
  const journey = buildRepurchaseJourney(
    orders.map((order) => ({
      id: String(order.id),
      customerId: String(order.customer_id ?? ""),
      totalPrice: Number(order.total_price ?? 0),
      processedAt: String(order.processed_at ?? order.created_at ?? ""),
      financialStatus: order.financial_status,
      cancelledAt: order.cancelled_at,
      sourceName: order.source_name,
    })),
  );

  const customerMap = new Map(customers.map((customer) => [String(customer.id), customer]));
  const orderMap = new Map(orders.map((order) => [String(order.id), order]));
  const relevantOrderIds = journey.flatMap((row) =>
    [row.firstOrderId, row.secondOrderId].filter((id): id is string => Boolean(id)),
  );
  const itemsByOrder = await loadItemsForOrders(relevantOrderIds);

  return { journey, customerMap, orderMap, itemsByOrder };
}

type RepurchaseData = Awaited<ReturnType<typeof loadRepurchaseData>>;

const dateRangeSchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

const targetWindowSchema = z.union(REPURCHASE_TARGET_WINDOWS.map((days) => z.literal(days)) as [z.ZodLiteral<7>, z.ZodLiteral<15>, z.ZodLiteral<30>, z.ZodLiteral<60>, z.ZodLiteral<90>]);

type RepurchaseDateRange = z.infer<typeof dateRangeSchema>;

function filterJourneyByFirstOrder(journey: RepurchaseCustomer[], range: RepurchaseDateRange): RepurchaseCustomer[] {
  const fromTime = range.from ? new Date(`${range.from}T00:00:00-03:00`).getTime() : null;
  const toTime = range.to ? new Date(`${range.to}T23:59:59.999-03:00`).getTime() : null;
  return journey.filter((row) => {
    const time = new Date(row.firstOrderAt).getTime();
    if (!Number.isFinite(time)) return false;
    return (fromTime === null || time >= fromTime) && (toTime === null || time <= toTime);
  });
}

async function loadRepurchaseSettings(): Promise<{ targetConversionRate: number; targetWindowDays: RepurchaseTargetWindowDays }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin.from("crm_repurchase_settings" as never) as any)
    .select("target_conversion_rate,target_window_days")
    .eq("id", true)
    .maybeSingle();
  if (error) throw new Error(`Erro ao carregar a meta de recompra: ${error.message}`);
  const rate = Number(data?.target_conversion_rate ?? DEFAULT_REPURCHASE_TARGET);
  const days = Number(data?.target_window_days ?? DEFAULT_REPURCHASE_TARGET_WINDOW_DAYS);
  return {
    targetConversionRate: Number.isFinite(rate) ? rate : DEFAULT_REPURCHASE_TARGET,
    targetWindowDays: (REPURCHASE_TARGET_WINDOWS as readonly number[]).includes(days)
      ? days as RepurchaseTargetWindowDays
      : DEFAULT_REPURCHASE_TARGET_WINDOW_DAYS,
  };
}

function getDataCoverage(journey: RepurchaseCustomer[]) {
  const times = journey.map((row) => new Date(row.firstOrderAt).getTime()).filter(Number.isFinite);
  if (!times.length) return { from: null, to: null, historyDays: 0 };
  const from = new Date(Math.min(...times));
  const to = new Date(Math.max(...times));
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    historyDays: Math.max(1, Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1),
  };
}

function buildProductPerformance(journey: RepurchaseCustomer[], data: RepurchaseData) {
  const stats = new Map<string, { name: string; customers: number; converted: number; secondRevenue: number }>();
  for (const row of journey) {
    const products = new Set(productLabels(data.itemsByOrder.get(row.firstOrderId)));
    for (const name of products) {
      const current = stats.get(name) ?? { name, customers: 0, converted: 0, secondRevenue: 0 };
      current.customers += 1;
      if (row.converted) {
        current.converted += 1;
        current.secondRevenue += row.secondOrderRevenue ?? 0;
      }
      stats.set(name, current);
    }
  }
  return [...stats.values()]
    .map((row) => ({ ...row, conversionRate: row.customers ? row.converted / row.customers : 0 }))
    .sort((a, b) => b.converted - a.converted || b.conversionRate - a.conversionRate || b.customers - a.customers)
    .slice(0, 10);
}

function buildSourcePerformance(journey: RepurchaseCustomer[]) {
  const stats = new Map<string, { source: string; customers: number; converted: number; secondRevenue: number }>();
  for (const row of journey) {
    const source = row.firstOrderSourceName?.trim() || "Não informado";
    const current = stats.get(source) ?? { source, customers: 0, converted: 0, secondRevenue: 0 };
    current.customers += 1;
    if (row.converted) {
      current.converted += 1;
      current.secondRevenue += row.secondOrderRevenue ?? 0;
    }
    stats.set(source, current);
  }
  return [...stats.values()]
    .map((row) => ({ ...row, conversionRate: row.customers ? row.converted / row.customers : 0 }))
    .sort((a, b) => b.customers - a.customers);
}

function enrichCustomer(row: RepurchaseData["journey"][number], data: RepurchaseData) {
  const customer = data.customerMap.get(row.customerId);
  const firstOrder = data.orderMap.get(row.firstOrderId);
  const name = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "Cliente";
  return {
    ...row,
    name,
    city: customer?.city ?? firstOrder?.city ?? null,
    province: customer?.province ?? firstOrder?.province ?? null,
    products: productLabels(data.itemsByOrder.get(row.firstOrderId)),
    sourceName: row.firstOrderSourceName ?? firstOrder?.source_name ?? null,
  };
}

function buildCampaignContext(stage: RepurchaseWindow, data: RepurchaseData) {
  const rows = data.journey.filter((row) => !row.converted && row.stage === stage);
  const avgTicket = rows.length ? rows.reduce((sum, row) => sum + row.firstOrderRevenue, 0) / rows.length : 0;
  const topProducts = new Map<string, number>();

  for (const row of rows) {
    for (const product of productLabels(data.itemsByOrder.get(row.firstOrderId))) {
      topProducts.set(product, (topProducts.get(product) ?? 0) + 1);
    }
  }

  return {
    audience: "1ª compra → 2ª compra",
    dynamicAudienceKey: `repurchase:first-to-second:${stage}`,
    stage,
    customerCount: rows.length,
    averageFirstOrderTicket: avgTicket,
    averageDaysSinceFirstOrder: rows.length
      ? rows.reduce((sum, row) => sum + row.daysSinceFirstOrder, 0) / rows.length
      : 0,
    topProducts: [...topProducts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count })),
    allowedActions: ["draft_campaign", "ai_suggestion"] as const,
    sendingEnabled: false,
    attributionRequired: true,
    note: "Rascunho somente. Nenhuma mensagem é enfileirada ou enviada por esta função.",
  };
}

export const getRepurchaseDashboard = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => dateRangeSchema.parse(input))
  .handler(async ({ data: range }) => {
    const [data, settings] = await Promise.all([loadRepurchaseData(), loadRepurchaseSettings()]);
    const journey = filterJourneyByFirstOrder(data.journey, range);
    return {
      settings,
      dataCoverage: getDataCoverage(data.journey),
      selectedRange: range,
      summary: summarizeRepurchase(journey, settings.targetConversionRate, settings.targetWindowDays),
      cohorts: buildRepurchaseCohorts(journey, settings.targetWindowDays),
      products: buildProductPerformance(journey, data),
      sources: buildSourcePerformance(journey),
    };
  });

export const saveRepurchaseSettings = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => z.object({
    targetConversionRate: z.number().min(0.001).max(1),
    targetWindowDays: targetWindowSchema,
  }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("crm_repurchase_settings" as never) as any).upsert({
      id: true,
      target_conversion_rate: data.targetConversionRate,
      target_window_days: data.targetWindowDays,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (error) throw new Error(`Erro ao salvar a meta de recompra: ${error.message}`);
    return { success: true as const };
  });

export const getRepurchaseCustomers = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) =>
    z
      .object({
        stage: z.union([repurchaseWindowSchema, z.literal("Convertido")]).optional(),
        search: z.string().max(120).optional(),
        limit: z.number().int().min(1).max(200).default(100),
        offset: z.number().int().min(0).default(0),
        from: z.string().date().optional(),
        to: z.string().date().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data: input }) => {
    const data = await loadRepurchaseData();
    const needle = (input.search ?? "").trim().toLowerCase();
    const rows = filterJourneyByFirstOrder(data.journey, { from: input.from, to: input.to })
      .filter((row) => !input.stage || row.stage === input.stage)
      .map((row) => enrichCustomer(row, data))
      .filter(
        (row) =>
          !needle ||
          row.name.toLowerCase().includes(needle) ||
          row.customerId.toLowerCase().includes(needle) ||
          row.products.some((product) => product.toLowerCase().includes(needle)),
      );

    return {
      total: rows.length,
      customers: rows.slice(input.offset, input.offset + input.limit),
    };
  });

export const getRepurchaseCampaignContext = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => z.object({ stage: repurchaseWindowSchema }).parse(input))
  .handler(async ({ data: input }) => {
    const data = await loadRepurchaseData();
    return buildCampaignContext(input.stage, data);
  });

export const createRepurchaseCampaignDraft = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => z.object({ stage: repurchaseWindowSchema }).parse(input))
  .handler(async ({ data: input }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const name = `Régua de recompra — ${input.stage}`;
    const firstPurchaseCondition = input.stage === "90+ dias"
      ? { field: "primeira_compra", operator: "older_than_days", value: 90 }
      : {
          field: "primeira_compra",
          operator: "between_days",
          value: input.stage === "0–7 dias" ? { min: 0, max: 7 }
            : input.stage === "8–15 dias" ? { min: 8, max: 15 }
              : input.stage === "16–30 dias" ? { min: 16, max: 30 }
                : input.stage === "31–60 dias" ? { min: 31, max: 60 }
                  : { min: 61, max: 90 },
        };
    const rules = { groups: [{ type: "AND", conditions: [
      { field: "total_pedidos", operator: "eq", value: 1 },
      firstPurchaseCondition,
    ] }] };
    const now = new Date().toISOString();
    const { data: existing } = await supabaseAdmin.from("crm_segments").select("id").eq("nome", name).maybeSingle();
    const query = existing
      ? supabaseAdmin.from("crm_segments").update({ descricao: `Público dinâmico da régua: ${input.stage}, ainda sem segunda compra.`, regras: rules, atualizado_em: now } as never).eq("id", existing.id)
      : supabaseAdmin.from("crm_segments").insert({ nome: name, descricao: `Público dinâmico da régua: ${input.stage}, ainda sem segunda compra.`, regras: rules, criado_em: now, atualizado_em: now } as never);
    const { data: segment, error } = await query.select("id,nome").single();
    if (error || !segment) throw new Error(`Erro ao preparar o segmento da campanha: ${error?.message ?? "segmento não retornado"}`);
    return {
      status: "segment_ready" as const,
      persisted: true,
      name: `Recompra — ${input.stage}`,
      segment: { id: String(segment.id), nome: String(segment.nome) },
    };
  });

const aiSuggestionSchema = z.object({
  approach: z.string(),
  message: z.string(),
  incentive: z.string(),
  cta: z.string(),
  offer: z.string(),
  rationale: z.string(),
});

export const suggestRepurchaseCampaign = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => z.object({ stage: repurchaseWindowSchema }).parse(input))
  .handler(async ({ data: input }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const data = await loadRepurchaseData();
    const context = buildCampaignContext(input.stage, data);

    const { data: settings } = await supabaseAdmin
      .from("store_settings")
      .select("openai_api_key")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!settings?.openai_api_key) {
      return { success: false as const, error: "API de IA não configurada." };
    }

    const prompt = `Você é especialista em CRM de e-commerce de semijoias. Crie UMA sugestão de campanha para estimular a segunda compra, sem inventar dados e sem executar qualquer envio.\n\nSegmento: ${context.stage}\nClientes: ${context.customerCount}\nTicket médio da primeira compra: R$ ${context.averageFirstOrderTicket.toFixed(2)}\nDias médios desde a primeira compra: ${context.averageDaysSinceFirstOrder.toFixed(1)}\nProdutos mais frequentes: ${JSON.stringify(context.topProducts)}\n\nResponda em JSON estrito com: approach, message, incentive, cta, offer, rationale. A mensagem deve ser curta, natural, em português do Brasil, e não deve prometer desconto inexistente; quando sugerir incentivo, deixe claro que é uma recomendação para aprovação humana.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.openai_api_key}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.5,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Você cria sugestões de CRM para aprovação humana. Nunca executa campanhas nem afirma que algo foi enviado.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) return { success: false as const, error: `IA respondeu HTTP ${response.status}.` };
    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return { success: false as const, error: "IA não retornou conteúdo." };

    try {
      return { success: true as const, suggestion: aiSuggestionSchema.parse(JSON.parse(content)) };
    } catch {
      return { success: false as const, error: "Resposta da IA fora do formato esperado." };
    }
  });
