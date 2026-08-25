import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";

const SHOPIFY_CUTOVER_AT = new Date("2026-08-17T00:00:00-03:00").getTime();
const OVERLAP_TOLERANCE_MS = 15 * 60 * 1000;

const customerSchema = z.object({
  id: z.string().min(1),
  email: z.string().email().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  province: z.string().nullable(),
  country: z.string().nullable(),
  firstOrderAt: z.string().datetime({ offset: true }),
  lastOrderAt: z.string().datetime({ offset: true }),
});

const orderSchema = z.object({
  id: z.string().startsWith("tray:"),
  orderNumber: z.string().min(1),
  trayOrderCode: z.string().min(1),
  customerId: z.string().min(1),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  processedAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  financialStatus: z.enum(["PAID", "CANCELLED", "PENDING"]),
  fulfillmentStatus: z.string().nullable(),
  subtotalPrice: z.number().finite(),
  totalDiscounts: z.number().finite(),
  totalShippingPrice: z.number().finite(),
  totalTax: z.number().finite(),
  totalPrice: z.number().finite(),
  city: z.string().nullable(),
  province: z.string().nullable(),
  country: z.string().nullable(),
  paymentType: z.string().nullable(),
  paymentDate: z.string().nullable(),
  shippingType: z.string().nullable(),
  coupon: z.string().nullable(),
  utmSource: z.string().nullable(),
  rawStatus: z.string().nullable(),
  channel: z.string().nullable(),
  trayCustomerCode: z.string().nullable(),
});

const itemSchema = z.object({
  id: z.string().startsWith("tray:"),
  orderId: z.string().startsWith("tray:"),
  trayOrderCode: z.string().min(1),
  trayProductCode: z.string().min(1),
  productId: z.string().startsWith("tray:"),
  sku: z.string().nullable(),
  title: z.string().min(1),
  quantity: z.number().int().min(0),
  price: z.number().finite(),
  totalDiscount: z.number().finite(),
});

const batchSchema = z.object({
  customers: z.array(customerSchema).max(250),
  orders: z.array(orderSchema).max(250),
  items: z.array(itemSchema).max(1200),
});

type ExistingCustomer = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ExistingOrder = {
  id: string;
  customer_id: string | null;
  email: string | null;
  total_price: number | null;
  processed_at: string | null;
  created_at: string | null;
  source_name: string | null;
};

function earlierIso(first: string | null | undefined, second: string): string {
  if (!first) return second;
  return new Date(first).getTime() <= new Date(second).getTime() ? first : second;
}

function laterIso(first: string | null | undefined, second: string): string {
  if (!first) return second;
  return new Date(first).getTime() >= new Date(second).getTime() ? first : second;
}

function sameMoney(first: unknown, second: number): boolean {
  const amount = Number(first ?? 0);
  return Number.isFinite(amount) && Math.abs(amount - second) <= 0.01;
}

function sameCustomer(existing: ExistingOrder, customerId: string, email: string | null): boolean {
  if (existing.customer_id && existing.customer_id === customerId) return true;
  if (!email || !existing.email) return false;
  return existing.email.trim().toLowerCase() === email.trim().toLowerCase();
}

function orderTimestamp(order: ExistingOrder): number {
  const value = order.processed_at ?? order.created_at;
  const time = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : Number.NaN;
}

async function getImportCounts() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [ordersResult, itemsResult, paidResult] = await Promise.all([
    (supabaseAdmin.from("shopify_orders") as any)
      .select("id", { count: "exact", head: true })
      .like("id", "tray:%"),
    supabaseAdmin
      .from("shopify_order_items")
      .select("id", { count: "exact", head: true })
      .like("id", "tray:%"),
    (supabaseAdmin.from("shopify_orders") as any)
      .select("id", { count: "exact", head: true })
      .like("id", "tray:%")
      .in("financial_status", ["PAID", "PARTIALLY_PAID"]),
  ]);

  if (ordersResult.error) throw new Error(`Erro ao contar pedidos Tray: ${ordersResult.error.message}`);
  if (itemsResult.error) throw new Error(`Erro ao contar itens Tray: ${itemsResult.error.message}`);
  if (paidResult.error) throw new Error(`Erro ao contar vendas válidas Tray: ${paidResult.error.message}`);

  return {
    trayOrders: ordersResult.count ?? 0,
    trayItems: itemsResult.count ?? 0,
    trayPaidOrders: paidResult.count ?? 0,
  };
}

export const getTrayImportStatus = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => getImportCounts());

export const importTrayHistoryBatch = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => batchSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const customerIds = [...new Set(data.customers.map((customer) => customer.id))];
    const existingCustomers = new Map<string, ExistingCustomer>();
    if (customerIds.length > 0) {
      const { data: rows, error } = await supabaseAdmin
        .from("shopify_customers")
        .select("id, email, first_name, last_name, phone, city, province, country, created_at, updated_at")
        .in("id", customerIds);
      if (error) throw new Error(`Erro ao verificar clientes antes da importação Tray: ${error.message}`);
      for (const row of (rows ?? []) as ExistingCustomer[]) existingCustomers.set(row.id, row);
    }

    if (data.customers.length > 0) {
      const customerRows = data.customers.map((customer) => {
        const existing = existingCustomers.get(customer.id);
        return {
          id: customer.id,
          email: existing?.email || customer.email,
          first_name: existing?.first_name || customer.firstName,
          last_name: existing?.last_name || customer.lastName,
          phone: existing?.phone || customer.phone,
          city: existing?.city || customer.city,
          province: existing?.province || customer.province,
          country: existing?.country || customer.country,
          created_at: earlierIso(existing?.created_at, customer.firstOrderAt),
          updated_at: laterIso(existing?.updated_at, customer.lastOrderAt),
        };
      });
      const { error } = await supabaseAdmin.from("shopify_customers").upsert(customerRows as never[]);
      if (error) throw new Error(`Erro ao importar clientes da Tray: ${error.message}`);
    }

    const orderIds = data.orders.map((order) => order.id);
    const existingTrayIds = new Set<string>();
    if (orderIds.length > 0) {
      const { data: existingRows, error } = await (supabaseAdmin.from("shopify_orders") as any)
        .select("id")
        .in("id", orderIds);
      if (error) throw new Error(`Erro ao verificar pedidos Tray já importados: ${error.message}`);
      for (const row of existingRows ?? []) existingTrayIds.add(String(row.id));
    }

    const overlapCandidates = data.orders.filter((order) => new Date(order.createdAt).getTime() >= SHOPIFY_CUTOVER_AT);
    const existingShopifyOrders: ExistingOrder[] = [];
    if (overlapCandidates.length > 0) {
      const minTime = Math.min(...overlapCandidates.map((order) => new Date(order.createdAt).getTime())) - OVERLAP_TOLERANCE_MS;
      const maxTime = Math.max(...overlapCandidates.map((order) => new Date(order.createdAt).getTime())) + OVERLAP_TOLERANCE_MS;
      const { data: rows, error } = await (supabaseAdmin.from("shopify_orders") as any)
        .select("id, customer_id, email, total_price, processed_at, created_at, source_name")
        .gte("created_at", new Date(minTime).toISOString())
        .lte("created_at", new Date(maxTime).toISOString());
      if (error) throw new Error(`Erro ao verificar sobreposição Tray/Shopify: ${error.message}`);
      for (const row of rows ?? []) {
        const id = String(row.id ?? "");
        if (id.startsWith("tray:") || String(row.source_name ?? "").toLowerCase() === "tray") continue;
        existingShopifyOrders.push(row as ExistingOrder);
      }
    }

    const skippedLikelyDuplicates = new Set<string>();
    for (const order of overlapCandidates) {
      const createdAt = new Date(order.createdAt).getTime();
      const duplicate = existingShopifyOrders.some((existing) => {
        const existingAt = orderTimestamp(existing);
        return (
          Number.isFinite(existingAt) &&
          Math.abs(existingAt - createdAt) <= OVERLAP_TOLERANCE_MS &&
          sameCustomer(existing, order.customerId, order.email) &&
          sameMoney(existing.total_price, order.totalPrice)
        );
      });
      if (duplicate) skippedLikelyDuplicates.add(order.id);
    }

    const acceptedOrders = data.orders.filter((order) => !skippedLikelyDuplicates.has(order.id));
    if (acceptedOrders.length > 0) {
      const orderRows = acceptedOrders.map((order) => ({
        id: order.id,
        order_number: order.orderNumber,
        customer_id: order.customerId,
        email: order.email,
        phone: order.phone,
        created_at: order.createdAt,
        processed_at: order.processedAt,
        updated_at: order.updatedAt,
        cancelled_at: null,
        financial_status: order.financialStatus,
        fulfillment_status: order.fulfillmentStatus,
        currency_code: "BRL",
        subtotal_price: order.subtotalPrice,
        total_discounts: order.totalDiscounts,
        total_shipping_price: order.totalShippingPrice,
        total_tax: order.totalTax,
        total_price: order.totalPrice,
        source_name: "tray",
        landing_site: null,
        referring_site: null,
        city: order.city,
        province: order.province,
        country: order.country,
        raw_data: {
          source: "tray",
          tray_order_code: order.trayOrderCode,
          tray_customer_code: order.trayCustomerCode,
          status_original: order.rawStatus,
          payment_type: order.paymentType,
          payment_date: order.paymentDate,
          shipping_type: order.shippingType,
          coupon: order.coupon,
          utm_source: order.utmSource,
          channel: order.channel,
        },
      }));
      const { error } = await (supabaseAdmin.from("shopify_orders") as any).upsert(orderRows);
      if (error) throw new Error(`Erro ao importar pedidos da Tray: ${error.message}`);
    }

    const acceptedOrderIds = new Set(acceptedOrders.map((order) => order.id));
    const acceptedItems = data.items.filter((item) => acceptedOrderIds.has(item.orderId));
    if (acceptedItems.length > 0) {
      const itemRows = acceptedItems.map((item) => ({
        id: item.id,
        order_id: item.orderId,
        product_id: item.productId,
        variant_id: null,
        title: item.title,
        variant_title: null,
        sku: item.sku,
        quantity: item.quantity,
        price: item.price,
        total_discount: item.totalDiscount,
      }));
      const { error } = await supabaseAdmin.from("shopify_order_items").upsert(itemRows as never[]);
      if (error) throw new Error(`Erro ao importar produtos dos pedidos da Tray: ${error.message}`);
    }

    const reimportedOrders = acceptedOrders.filter((order) => existingTrayIds.has(order.id)).length;
    return {
      customersProcessed: data.customers.length,
      ordersProcessed: acceptedOrders.length,
      itemsProcessed: acceptedItems.length,
      newOrders: acceptedOrders.length - reimportedOrders,
      reimportedOrders,
      skippedLikelyDuplicates: skippedLikelyDuplicates.size,
    };
  });

export const finalizeTrayHistoryImport = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { recalculateRFM } = await import("./crm-rfm.server");
    const rfm = await recalculateRFM();
    const counts = await getImportCounts();
    return {
      ...counts,
      rfm: {
        updatedCustomers: rfm.count,
        evaluatedCustomers: rfm.evaluatedCustomers,
        buyers: rfm.buyers,
        historyDays: rfm.historyDays,
        classicMode: rfm.classicMode,
      },
    };
  });
