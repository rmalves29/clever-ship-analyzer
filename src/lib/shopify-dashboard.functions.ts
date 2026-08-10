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

    // Queries to calculate metrics
    const { data: orders } = await supabaseAdmin
      .from("shopify_orders")
      .select("*")
      .gte("processed_at", startISO)
      .lte("processed_at", endISO)
      .neq("financial_status", "VOIDED");

    if (!orders) return { kpis: [], chartData: [] };

    // Valid orders for finance (excluding full refunds)
    const validOrders = orders.filter(o => o.financial_status !== "REFUNDED");
    
    const faturamento = validOrders.reduce((acc, o) => acc + Number(o.total_price), 0);
    const numPedidos = validOrders.length;
    const ticketMedio = numPedidos > 0 ? faturamento / numPedidos : 0;
    
    const uniqueCustomers = new Set(validOrders.map(o => o.customer_id)).size;

    // Shipping metrics
    const { data: fulfillments } = await supabaseAdmin
      .from("shopify_fulfillments")
      .select("*, shopify_orders(processed_at)")
      .gte("created_at", startISO)
      .lte("created_at", endISO);

    const pedidosEnviados = fulfillments?.length || 0;
    
    // Calculate average send time
    let totalSendTimeHours = 0;
    let countWithTime = 0;

    fulfillments?.forEach(f => {
      const orderProcessedAt = (f.shopify_orders as any)?.processed_at;
      if (orderProcessedAt) {
        const diff = new Date(f.created_at).getTime() - new Date(orderProcessedAt).getTime();
        totalSendTimeHours += diff / (1000 * 60 * 60);
        countWithTime++;
      }
    });

    const tempoMedioEnvioDias = countWithTime > 0 ? (totalSendTimeHours / countWithTime) / 24 : 0;

    return {
      faturamento,
      numPedidos,
      ticketMedio,
      uniqueCustomers,
      pedidosEnviados,
      tempoMedioEnvioDias,
      // ... other metrics requested
    };
  });
