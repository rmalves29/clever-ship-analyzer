import {
  buildCustomerContexts,
  type CRMOrderForSegmentation,
  type CRMOrderItemForSegmentation,
} from "./crm-segmentation-shared";
import type { CRMAdvancedCustomerContext } from "./crm-product-segmentation";
import { isRevenueValidOrder } from "./crm-rfm-shared";

const PAGE_SIZE = 1000;
const ORDER_ID_BATCH = 200;

type LoadedOrderItem = CRMOrderItemForSegmentation & {
  totalDiscount?: number | null;
};

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

async function loadValidOrderItems(orders: CRMOrderForSegmentation[]): Promise<LoadedOrderItem[]> {
  const db = await admin();
  const validOrderIds = [...new Set(orders.filter(isRevenueValidOrder).map((order) => order.id))];
  const rows: LoadedOrderItem[] = [];

  for (let start = 0; start < validOrderIds.length; start += ORDER_ID_BATCH) {
    const ids = validOrderIds.slice(start, start + ORDER_ID_BATCH);
    const { data, error } = await db
      .from("shopify_order_items")
      .select("order_id, product_id, variant_id, sku, title, variant_title, quantity, price, total_discount")
      .in("order_id", ids);
    if (error) throw new Error(`Erro ao buscar itens de pedidos válidos do CRM: ${error.message}`);

    for (const item of data ?? []) {
      if (!item.order_id) continue;
      rows.push({
        orderId: String(item.order_id),
        productId: item.product_id ? String(item.product_id) : null,
        variantId: item.variant_id ? String(item.variant_id) : null,
        sku: item.sku,
        title: item.title,
        variantTitle: item.variant_title,
        quantity: item.quantity,
        price: item.price,
        totalDiscount: item.total_discount,
      });
    }
  }

  return rows;
}

function buildProductSpendIndex(
  orders: CRMOrderForSegmentation[],
  items: LoadedOrderItem[],
): Map<string, Map<string, number>> {
  const validOrders = new Map(
    orders
      .filter((order) => order.customerId && isRevenueValidOrder(order))
      .map((order) => [order.id, order] as const),
  );
  const index = new Map<string, Map<string, number>>();

  for (const item of items) {
    const order = validOrders.get(item.orderId);
    const productId = String(item.productId ?? "").trim();
    if (!order || !productId) continue;
    const quantity = Number(item.quantity ?? 0);
    const unitPrice = Number(item.price ?? 0);
    const discount = Number(item.totalDiscount ?? 0);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice)) continue;
    const lineNet = Math.max(0, unitPrice * quantity - (Number.isFinite(discount) ? discount : 0));
    const customerSpend = index.get(order.customerId) ?? new Map<string, number>();
    customerSpend.set(productId, (customerSpend.get(productId) ?? 0) + lineNet);
    index.set(order.customerId, customerSpend);
  }

  return index;
}

async function loadLatestAbandonedCheckoutByCustomer(): Promise<Map<string, string>> {
  const db = await admin();
  const latest = new Map<string, string>();
  for (let page = 0; ; page++) {
    const { data, error } = await db
      .from("shopify_abandoned_checkouts")
      .select("customer_id, created_at")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (error) throw new Error(`Erro ao buscar checkouts abandonados: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (!row.customer_id || !row.created_at) continue;
      const customerId = String(row.customer_id);
      const current = latest.get(customerId);
      if (!current || new Date(row.created_at).getTime() > new Date(current).getTime()) {
        latest.set(customerId, row.created_at);
      }
    }
    if (data.length < PAGE_SIZE) break;
  }
  return latest;
}

function startOfBusinessDay(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
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

export async function loadCRMProductFilterOptions(): Promise<Array<{ id: string; title: string; skus: string[] }>> {
  const orders = await loadOrders();
  const items = await loadValidOrderItems(orders);
  const products = new Map<string, { id: string; title: string; skus: Set<string> }>();

  for (const item of items) {
    const id = String(item.productId ?? "").trim();
    if (!id) continue;
    const current = products.get(id) ?? {
      id,
      title: item.title?.trim() || `Produto ${id}`,
      skus: new Set<string>(),
    };
    if ((!current.title || current.title.startsWith("Produto ")) && item.title?.trim()) current.title = item.title.trim();
    if (item.sku?.trim()) current.skus.add(item.sku.trim());
    products.set(id, current);
  }

  return [...products.values()]
    .map((product) => ({ ...product, skus: [...product.skus].sort((a, b) => a.localeCompare(b, "pt-BR")) }))
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
}

export async function loadCRMSegmentationContext(now = new Date()): Promise<CRMAdvancedCustomerContext[]> {
  const [customers, orders, abandonedCheckoutAtByCustomer] = await Promise.all([
    loadCustomers(),
    loadOrders(),
    loadLatestAbandonedCheckoutByCustomer(),
  ]);
  const [shippedTodayValidOrderIds, orderItems] = await Promise.all([
    loadShippedTodayValidOrderIds(orders, now),
    loadValidOrderItems(orders),
  ]);
  const baseContexts = buildCustomerContexts({
    customers,
    orders,
    orderItems,
    abandonedCheckoutAtByCustomer,
    shippedTodayValidOrderIds,
  });
  const spendIndex = buildProductSpendIndex(orders, orderItems);
  return baseContexts.map((context) => ({
    ...context,
    productSpentById: spendIndex.get(context.customer.id) ?? new Map<string, number>(),
  }));
}
