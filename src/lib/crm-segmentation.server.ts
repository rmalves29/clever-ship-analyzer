import { buildCustomerContexts, type CRMCustomerContext, type CRMOrderForSegmentation } from "./crm-segmentation-shared";
import { isRevenueValidOrder } from "./crm-rfm-shared";

const PAGE_SIZE = 1000;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function loadCustomers() {
  const db = await admin();
  const rows: any[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("shopify_customers")
      .select("*")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Erro ao buscar clientes do CRM: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadOrders(): Promise<CRMOrderForSegmentation[]> {
  const db = await admin();
  const rows: CRMOrderForSegmentation[] = [];
  for (let page = 0; ; page++) {
    // `cancelled_at` existe no banco, mas o snapshot local de tipos ainda não foi regenerado.
    const { data, error } = await (db.from("shopify_orders") as any)
      .select("id, customer_id, total_price, processed_at, created_at, financial_status, cancelled_at")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Erro ao buscar pedidos do CRM: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data as any[]) {
      if (!row.customer_id) continue;
      rows.push({
        id: String(row.id),
        customerId: String(row.customer_id),
        totalPrice: Number(row.total_price ?? 0),
        processedAt: String(row.processed_at ?? row.created_at ?? ""),
        financialStatus: row.financial_status,
        cancelledAt: row.cancelled_at,
      });
    }
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function loadAbandonedCustomerIds(): Promise<Set<string>> {
  const db = await admin();
  const ids = new Set<string>();
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("shopify_abandoned_checkouts")
      .select("customer_id")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Erro ao buscar checkouts abandonados: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) if (row.customer_id) ids.add(String(row.customer_id));
    if (data.length < PAGE_SIZE) break;
  }
  return ids;
}

function startOfBusinessDay(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  // São Paulo is UTC-3 in the current business context; using an explicit offset makes the
  // boundary deterministic for the CRM's "hoje" filters.
  return new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00-03:00`);
}

async function loadShippedTodayValidOrderIds(orders: CRMOrderForSegmentation[], now: Date): Promise<Set<string>> {
  const db = await admin();
  const start = startOfBusinessDay(now);
  const end = new Date(start.getTime() + 86_400_000);
  const validOrderIds = new Set(orders.filter(isRevenueValidOrder).map((order) => order.id));
  if (validOrderIds.size === 0) return new Set<string>();

  const shipped = new Set<string>();
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("shopify_fulfillments")
      .select("order_id")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString())
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Erro ao buscar envios de hoje: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (row.order_id && validOrderIds.has(String(row.order_id))) shipped.add(String(row.order_id));
    }
    if (data.length < PAGE_SIZE) break;
  }
  return shipped;
}

export async function loadCRMSegmentationContext(now = new Date()): Promise<CRMCustomerContext[]> {
  const [customers, orders, abandonedCustomerIds] = await Promise.all([
    loadCustomers(),
    loadOrders(),
    loadAbandonedCustomerIds(),
  ]);
  const shippedTodayValidOrderIds = await loadShippedTodayValidOrderIds(orders, now);
  return buildCustomerContexts({ customers, orders, abandonedCustomerIds, shippedTodayValidOrderIds });
}
