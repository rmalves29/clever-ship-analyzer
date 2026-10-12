/**
 * Busca no banco os eventos de pedido/carrinho que disparam automações. Cada alvo traz o cliente e o
 * pedido (ou carrinho) específico do evento, para a mensagem usar o rastreio/itens certos.
 */
import {
  AUTOMATION_EVENT_BY_ID,
  eventWindow,
  quickFiltersToRules,
  type AutomationEventId,
  type EventTrigger,
} from "./automation-events";

export type EventTarget = {
  customerId: string;
  orderId?: string | undefined;
  checkoutId?: string | undefined;
  /** Quando o evento aconteceu (ISO). */
  eventAt: string;
};

const PAGE = 1000;
const BATCH = 200;
const VALID_PAID = ["PAID", "PARTIALLY_PAID", "PARTIALLY_REFUNDED"];

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function pageAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, label: string): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await build(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(`Erro ao buscar ${label}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function inBatches<T>(ids: string[], run: (batch: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, label: string): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; start < ids.length; start += BATCH) {
    const { data, error } = await run(ids.slice(start, start + BATCH));
    if (error) throw new Error(`Erro ao buscar ${label}: ${error.message}`);
    rows.push(...(data ?? []));
  }
  return rows;
}

type OrderRow = {
  id: string;
  customer_id: string | null;
  created_at: string | null;
  processed_at: string | null;
  updated_at: string | null;
  financial_status: string | null;
  cancelled_at: string | null;
};

async function ordersCreatedBetween(from: Date, to: Date): Promise<OrderRow[]> {
  const db = await admin();
  return pageAll<OrderRow>(
    (a, b) =>
      db
        .from("shopify_orders")
        .select("id, customer_id, created_at, processed_at, updated_at, financial_status, cancelled_at")
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString())
        .not("customer_id", "is", null)
        .order("created_at", { ascending: true })
        .range(a, b),
    "pedidos do evento",
  );
}

function orderTarget(order: OrderRow, eventAt: string | null): EventTarget | null {
  if (!order.customer_id) return null;
  return { customerId: String(order.customer_id), orderId: String(order.id), eventAt: eventAt ?? order.created_at ?? new Date().toISOString() };
}

type FulfillmentRow = { id: string; order_id: string | null; created_at: string | null; updated_at: string | null; display_status: string | null };

async function fulfillmentTargets(
  column: "created_at" | "updated_at",
  from: Date,
  to: Date,
  statuses: readonly string[] | null,
  options: { excludeStatuses?: readonly string[]; requireTracking?: boolean } = {},
): Promise<EventTarget[]> {
  const excludeStatuses = options.excludeStatuses ?? ["CANCELED"];
  const db = await admin();
  const rows = await pageAll<FulfillmentRow>(
    (a, b) => {
      let q = db
        .from("shopify_fulfillments")
        .select("id, order_id, created_at, updated_at, display_status")
        .gte(column, from.toISOString())
        .lte(column, to.toISOString())
        .not("order_id", "is", null);
      if (statuses) q = q.in("display_status", [...statuses]);
      if (options.requireTracking) q = q.not("tracking_number", "is", null).neq("tracking_number", "");
      return q.order(column, { ascending: true }).range(a, b);
    },
    "envios do evento",
  );
  const filtered = rows.filter((r) => !excludeStatuses.includes(String(r.display_status ?? "")));
  const orderIds = [...new Set(filtered.map((r) => String(r.order_id)))];
  const orders = await inBatches<OrderRow>(
    orderIds,
    (batch) => db.from("shopify_orders").select("id, customer_id, created_at, processed_at, updated_at, financial_status, cancelled_at").in("id", batch),
    "pedidos dos envios",
  );
  const orderById = new Map(orders.map((o) => [String(o.id), o]));
  const seen = new Set<string>();
  const targets: EventTarget[] = [];
  for (const row of filtered) {
    const order = orderById.get(String(row.order_id));
    if (!order || order.cancelled_at) continue;
    if (seen.has(order.id)) continue;
    seen.add(order.id);
    const target = orderTarget(order, row[column]);
    if (target) targets.push(target);
  }
  return targets;
}

async function abandonedCheckoutTargets(from: Date, to: Date): Promise<EventTarget[]> {
  const db = await admin();
  const checkouts = await pageAll<{ id: string; customer_id: string | null; created_at: string | null }>(
    (a, b) =>
      db
        .from("shopify_abandoned_checkouts")
        .select("id, customer_id, created_at")
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString())
        .not("customer_id", "is", null)
        .order("created_at", { ascending: true })
        .range(a, b),
    "carrinhos abandonados",
  );
  if (checkouts.length === 0) return [];
  const customerIds = [...new Set(checkouts.map((c) => String(c.customer_id)))];
  const bought = await inBatches<{ customer_id: string; processed_at: string | null; created_at: string | null; financial_status: string | null; cancelled_at: string | null }>(
    customerIds,
    (batch) =>
      db
        .from("shopify_orders")
        .select("customer_id, processed_at, created_at, financial_status, cancelled_at")
        .in("customer_id", batch)
        .gte("created_at", from.toISOString()),
    "compras posteriores ao carrinho",
  );
  const latestPurchaseAt = new Map<string, number>();
  for (const order of bought) {
    if (order.cancelled_at || !VALID_PAID.includes(String(order.financial_status ?? ""))) continue;
    const at = new Date(order.processed_at ?? order.created_at ?? 0).getTime();
    const current = latestPurchaseAt.get(String(order.customer_id)) ?? 0;
    if (at > current) latestPurchaseAt.set(String(order.customer_id), at);
  }
  return checkouts.flatMap((checkout) => {
    const createdAt = new Date(checkout.created_at ?? 0).getTime();
    // Quem comprou depois de abrir o carrinho não está "abandonando" — não cobra.
    if ((latestPurchaseAt.get(String(checkout.customer_id)) ?? 0) > createdAt) return [];
    return [{ customerId: String(checkout.customer_id), checkoutId: String(checkout.id), eventAt: checkout.created_at ?? new Date().toISOString() }];
  });
}

async function newCustomerTargets(from: Date, to: Date): Promise<EventTarget[]> {
  const db = await admin();
  const rows = await pageAll<{ id: string; created_at: string | null }>(
    (a, b) =>
      db
        .from("shopify_customers")
        .select("id, created_at")
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString())
        .order("created_at", { ascending: true })
        .range(a, b),
    "contatos novos",
  );
  return rows.map((r) => ({ customerId: String(r.id), eventAt: r.created_at ?? new Date().toISOString() }));
}

async function productionTargets(from: Date, to: Date): Promise<EventTarget[]> {
  const db = await admin();
  const orders = (await ordersCreatedBetween(from, to)).filter(
    (o) => !o.cancelled_at && VALID_PAID.includes(String(o.financial_status ?? "")),
  );
  if (orders.length === 0) return [];
  const shipped = await inBatches<{ order_id: string; display_status: string | null }>(
    orders.map((o) => String(o.id)),
    (batch) => db.from("shopify_fulfillments").select("order_id, display_status").in("order_id", batch),
    "envios dos pedidos",
  );
  const shippedIds = new Set(shipped.filter((f) => String(f.display_status ?? "") !== "CANCELED").map((f) => String(f.order_id)));
  return orders.flatMap((o) => (shippedIds.has(String(o.id)) ? [] : [orderTarget(o, o.processed_at ?? o.created_at)].filter((t): t is EventTarget => Boolean(t))));
}

/** Alvos do evento dentro da janela, sem aplicar os filtros de cliente. */
export async function findEventTargets(event: AutomationEventId, lookbackHours: number, now = new Date()): Promise<EventTarget[]> {
  const { from, to } = eventWindow(now, lookbackHours);
  switch (event) {
    case "pedido_criado":
      return (await ordersCreatedBetween(from, to)).filter((o) => !o.cancelled_at).flatMap((o) => orderTarget(o, o.created_at) ?? []);
    case "pedido_pago":
      // O pagamento aprovado pode chegar depois do pedido (Pix): usa a última atualização do pedido pago.
      return pageAll<OrderRow>(
        async (a, b) => {
          const db = await admin();
          return db
            .from("shopify_orders")
            .select("id, customer_id, created_at, processed_at, updated_at, financial_status, cancelled_at")
            .in("financial_status", VALID_PAID)
            .gte("updated_at", from.toISOString())
            .lte("updated_at", to.toISOString())
            .not("customer_id", "is", null)
            .is("cancelled_at", null)
            .order("updated_at", { ascending: true })
            .range(a, b);
        },
        "pedidos pagos",
      ).then((rows) => rows.flatMap((o) => orderTarget(o, o.updated_at) ?? []));
    case "pedido_pendente":
      return (await ordersCreatedBetween(from, to))
        .filter((o) => !o.cancelled_at && String(o.financial_status ?? "").toUpperCase() === "PENDING")
        .flatMap((o) => orderTarget(o, o.created_at) ?? []);
    case "pedido_producao":
      return productionTargets(from, to);
    case "pedido_enviado":
      // Só avisa quando o código de rastreio já existe — a mensagem é justamente sobre ele.
      return fulfillmentTargets("created_at", from, to, null, { requireTracking: true });
    case "pedido_saiu_entrega":
      return fulfillmentTargets("updated_at", from, to, ["OUT_FOR_DELIVERY"]);
    case "pedido_entregue":
      return fulfillmentTargets("updated_at", from, to, ["DELIVERED"]);
    case "entrega_problema":
      return fulfillmentTargets("updated_at", from, to, ["ATTEMPTED_DELIVERY", "NOT_DELIVERED"]);
    case "pedido_cancelado": {
      const db = await admin();
      const rows = await pageAll<OrderRow>(
        (a, b) =>
          db
            .from("shopify_orders")
            .select("id, customer_id, created_at, processed_at, updated_at, financial_status, cancelled_at")
            .gte("cancelled_at", from.toISOString())
            .lte("cancelled_at", to.toISOString())
            .not("customer_id", "is", null)
            .order("cancelled_at", { ascending: true })
            .range(a, b),
        "pedidos cancelados",
      );
      return rows.flatMap((o) => orderTarget(o, o.cancelled_at) ?? []);
    }
    case "carrinho_abandonado":
      return abandonedCheckoutTargets(from, to);
    case "cliente_cadastrado":
      return newCustomerTargets(from, to);
  }
}

let contextCache: { at: number; value: Promise<unknown> } | null = null;
const CONTEXT_CACHE_MS = 90_000;

/** A base inteira leva dezenas de segundos para carregar; ao ajustar filtros na tela a prévia reaproveita a última leitura. */
function loadCachedSegmentationContext<T>(load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  if (contextCache && now - contextCache.at < CONTEXT_CACHE_MS) return contextCache.value as Promise<T>;
  const value = load();
  contextCache = { at: now, value };
  value.catch(() => {
    if (contextCache?.value === value) contextCache = null;
  });
  return value;
}

/** Mantém só os alvos cujo cliente passa nos filtros rápidos (E entre eles) e, se houver, no segmento salvo. */
export async function applyEventAudienceFilters(
  targets: EventTarget[],
  trigger: Pick<EventTrigger, "filters">,
  segment?: { segmentType: string; segmentId?: string | undefined } | null,
): Promise<EventTarget[]> {
  if (targets.length === 0) return targets;
  let allowed: Set<string> | null = null;

  const rules = quickFiltersToRules(trigger.filters);
  if (rules) {
    const [{ loadCRMSegmentationContext }, { matchesAdvancedSegmentRules }] = await Promise.all([
      import("./crm-segmentation.server"),
      import("./crm-product-segmentation"),
    ]);
    const wanted = new Set(targets.map((t) => t.customerId));
    const contexts = await loadCachedSegmentationContext(loadCRMSegmentationContext);
    allowed = new Set(contexts.filter((c) => wanted.has(c.customer.id) && matchesAdvancedSegmentRules(c, rules)).map((c) => c.customer.id));
  }

  if (segment && (segment.segmentId || (segment.segmentType && segment.segmentType !== "evento" && segment.segmentType !== "custom"))) {
    const { resolveWhatsappSegmentCustomerIds } = await import("./whatsapp-segment-resolver.server");
    const ids = new Set(await resolveWhatsappSegmentCustomerIds(segment.segmentType, segment.segmentId));
    allowed = allowed ? new Set([...allowed].filter((id) => ids.has(id))) : ids;
  }

  return allowed ? targets.filter((t) => allowed!.has(t.customerId)) : targets;
}

export function isEventSubject(event: AutomationEventId): "order" | "checkout" | "customer" {
  return AUTOMATION_EVENT_BY_ID.get(event)?.subject ?? "order";
}
