import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";
import {
  buildRepurchaseCohorts,
  buildRepurchaseJourney,
  REPURCHASE_WINDOWS,
  summarizeRepurchase,
  type RepurchaseWindow,
} from "./crm-repurchase-shared";

const PAGE_SIZE = 1000;
const repurchaseWindowSchema = z.enum(REPURCHASE_WINDOWS as [RepurchaseWindow, ...RepurchaseWindow[]]);

type CustomerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  province: string | null;
};

type OrderItemRow = {
  order_id: string | null;
  title: string | null;
  variant_title: string | null;
  quantity: number | null;
};

async function loadAllOrders() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows: Array<{
    id: string;
    customer_id: string | null;
    total_price: number;
    processed_at: string | null;
    created_at: string;
    financial_status: string | null;
    source_name: string | null;
    city: string | null;
    province: string | null;
  }> = [];

  for (let page = 0; ; page += 1) {
    const { data, error } = await supabaseAdmin
      .from("shopify_orders")
      .select("id,customer_id,total_price,processed_at,created_at,financial_status,source_name,city,province")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Erro ao carregar pedidos da régua: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadAllCustomers() {
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
    orders.map((o) => ({
      id: String(o.id),
      customerId: String(o.customer_id ?? ""),
      totalPrice: Number(o.total_price ?? 0),
      processedAt: String(o.processed_at ?? o.created_at ?? ""),
      financialStatus: o.financial_status,
      sourceName: o.source_name,
    })),
  );

  const customerMap = new Map(customers.map((c) => [String(c.id), c]));
  const orderMap = new Map(orders.map((o) => [String(o.id), o]));
  const relevantOrderIds = journey.flatMap((row) => [row.firstOrderId, row.secondOrderId].filter((id): id is string => Boolean(id)));
  const itemsByOrder = await loadItemsForOrders(relevantOrderIds);

  return { journey, customerMap, orderMap, itemsByOrder };
}

function enrichCustomer(
  row: Awaited<ReturnType<typeof loadRepurchaseData>>["journey"][number],
  data: Awaited<ReturnType<typeof loadRepurchaseData>>,
) {
  const c = data.customerMap.get(row.customerId);
  const firstOrder = data.orderMap.get(row.firstOrderId);
  const name = [c?.first_name, c?.last_name].filter(Boolean).join(" ") || "Cliente";
  return {
    ...row,
    name,
    city: c?.city ?? firstOrder?.city ?? null,
    province: c?.province ?? firstOrder?.province ?? null,
    products: productLabels(data.itemsByOrder.get(row.firstOrderId)),
    sourceName: row.firstOrderSourceName ?? firstOrder?.source_name ?? null,
  };
}

export const getRepurchaseDashboard = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const data = await loadRepurchaseData();
    return {
      summary: summarizeRepurchase(data.journey),
      cohorts: buildRepurchaseCohorts(data.journey),
    };
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
      })
      .parse(input),
  )
  .handler(async ({ data: input }) => {
    const data = await loadRepurchaseData();
    const needle = (input.search ?? "").trim().toLowerCase();
    const rows = data.journey
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
    const rows = data.journey.filter((x) => !x.converted && x.stage === input.stage);
    const avgTicket = rows.length ? rows.reduce((s, x) => s + x.firstOrderRevenue, 0) / rows.length : 0;
    const topProducts = new Map<string, number>();
    for (const row of rows) {
      for (const product of productLabels(data.itemsByOrder.get(row.firstOrderId))) {
        topProducts.set(product, (topProducts.get(product) ?? 0) + 1);
      }
    }

    return {
      audience: "1ª compra → 2ª compra",
      dynamicAudienceKey: `repurchase:first-to-second:${input.stage}`,
      stage: input.stage,
      customerCount: rows.length,
      averageFirstOrderTicket: avgTicket,
      averageDaysSinceFirstOrder: rows.length
        ? rows.reduce((s, x) => s + x.daysSinceFirstOrder, 0) / rows.length
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
  });

export const createRepurchaseCampaignDraft = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => z.object({ stage: repurchaseWindowSchema }).parse(input))
  .handler(async ({ data: input }) => {
    const context = await getRepurchaseCampaignContext({ data: { stage: input.stage } } as never);
    return {
      status: "draft" as const,
      persisted: false,
      sendingEnabled: false,
      name: `Recompra — ${input.stage}`,
      channelOptions: ["whatsapp_meta", "uazapi", "email", "coupon"] as const,
      audience: context,
      attribution: {
        required: true,
        acceptedEvidence: ["coupon", "tracked_link", "campaign_specific_landing", "explicit_customer_reply", "manual_verified"],
        temporalOnlyAttributionAllowed: false,
      },
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
    const rows = data.journey.filter((x) => !x.converted && x.stage === input.stage);
    const averageTicket = rows.length ? rows.reduce((s, x) => s + x.firstOrderRevenue, 0) / rows.length : 0;
    const averageDays = rows.length ? rows.reduce((s, x) => s + x.daysSinceFirstOrder, 0) / rows.length : 0;
    const productCounts = new Map<string, number>();
    for (const row of rows) {
      for (const product of productLabels(data.itemsByOrder.get(row.firstOrderId))) {
        productCounts.set(product, (productCounts.get(product) ?? 0) + 1);
      }
    }
    const topProducts = [...productCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

    const { data: settings } = await supabaseAdmin
      .from("store_settings")
      .select("openai_api_key")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!settings?.openai_api_key) {
      return { success: false as const, error: "API de IA não configurada." };
    }

    const prompt = `Você é especialista em CRM de e-commerce de semijoias. Crie UMA sugestão de campanha para estimular a segunda compra, sem inventar dados e sem executar qualquer envio.\n\nSegmento: ${input.stage}\nClientes: ${rows.length}\nTicket médio da primeira compra: R$ ${averageTicket.toFixed(2)}\nDias médios desde a primeira compra: ${averageDays.toFixed(1)}\nProdutos mais frequentes: ${JSON.stringify(topProducts)}\n\nResponda em JSON estrito com: approach, message, incentive, cta, offer, rationale. A mensagem deve ser curta, natural, em português do Brasil, e não deve prometer desconto inexistente; quando sugerir incentivo, deixe claro que é uma recomendação para aprovação humana.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.openai_api_key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.5,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Você cria sugestões de CRM para aprovação humana. Nunca executa campanhas nem afirma que algo foi enviado." },
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
