import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const TZ = "America/Sao_Paulo";

const dashboardInput = z.object({
  period: z.enum(["diario", "semanal", "mensal", "anual", "personalizado"]),
  range: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
  }).optional(),
});

export const getShopifyDashboardData = createServerFn({ method: "POST" })
  .validator((data: unknown) => dashboardInput.parse(data))
  .handler(async ({ data: { period, range } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const now = toZonedTime(new Date(), TZ);
    let start: Date;
    let end: Date = endOfDay(now);

    if (period === "diario") {
      start = startOfDay(now);
    } else if (period === "mensal") {
      start = startOfMonth(now);
    } else if (period === "anual") {
      start = startOfYear(now);
    } else if (period === "semanal") {
      start = startOfDay(subDays(now, 7));
    } else if (period === "personalizado" && range?.from) {
      start = startOfDay(new Date(range.from));
      if (range.to) end = endOfDay(new Date(range.to));
    } else {
      start = startOfMonth(now);
    }

    const startISO = start.toISOString();
    const endISO = end.toISOString();

    const { data: orders } = await supabaseAdmin
      .from("shopify_orders")
      .select("*")
      .gte("processed_at", startISO)
      .lte("processed_at", endISO)
      .neq("financial_status", "VOIDED");

    if (!orders) throw new Error("Falha ao ler pedidos");

    const validOrders = orders.filter(o => o.financial_status !== "REFUNDED");
    
    const faturamento = validOrders.reduce((acc, o) => acc + Number(o.total_price), 0);
    const numPedidos = validOrders.length;
    const ticketMedio = numPedidos > 0 ? faturamento / numPedidos : 0;
    
    const uniqueCustomers = new Set(validOrders.map(o => o.customer_id)).size;

    // Shipped = fulfillment with a tracking code created within the period
    const { data: fulfillments } = await supabaseAdmin
      .from("shopify_fulfillments")
      .select("*, shopify_orders!inner(processed_at)")
      .not("tracking_number", "is", null)
      .gte("created_at", startISO)
      .lte("created_at", endISO);

    const shippedOrderIds = Array.from(
      new Set((fulfillments ?? []).map((f) => f.order_id).filter(Boolean) as string[]),
    );
    const pedidosEnviadosCount = shippedOrderIds.length;

    let produtosEnviadosCount = 0;
    if (shippedOrderIds.length > 0) {
      const { data: items } = await supabaseAdmin
        .from("shopify_order_items")
        .select("quantity, order_id")
        .in("order_id", shippedOrderIds);
      produtosEnviadosCount = (items ?? []).reduce((acc, i) => acc + (i.quantity ?? 0), 0);
    }

    // Average shipping time = first fulfillment date - payment/processing date
    const firstFulfillmentByOrder = new Map<string, { at: string; processedAt: string | null }>();
    for (const f of fulfillments ?? []) {
      if (!f.order_id || !f.created_at) continue;
      const processedAt = (f.shopify_orders as any)?.processed_at ?? null;
      const current = firstFulfillmentByOrder.get(f.order_id);
      if (!current || new Date(f.created_at) < new Date(current.at)) {
        firstFulfillmentByOrder.set(f.order_id, { at: f.created_at, processedAt });
      }
    }

    let totalSendTimeHours = 0;
    let countWithTime = 0;
    firstFulfillmentByOrder.forEach(({ at, processedAt }) => {
      if (!processedAt) return;
      totalSendTimeHours += (new Date(at).getTime() - new Date(processedAt).getTime()) / 3_600_000;
      countWithTime++;
    });

    const tempoMedioEnvioHoras = countWithTime > 0 ? totalSendTimeHours / countWithTime : 0;
    const tempoMedioEnvioDias = tempoMedioEnvioHoras / 24;

    return {
      faturamento,
      numPedidos,
      ticketMedio,
      uniqueCustomers,
      pedidosEnviadosCount,
      produtosEnviadosCount,
      tempoMedioEnvioDias,
      tempoMedioEnvioHoras,
      tempoMedioEnvioAmostra: countWithTime,
    };
  });
