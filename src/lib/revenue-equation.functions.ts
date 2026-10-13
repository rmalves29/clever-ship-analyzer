import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";
import { EQUATION_WINDOWS } from "./revenue-equation";

const inputSchema = z.object({ windowDays: z.union([z.literal(30), z.literal(60), z.literal(90)]).default(90) });

/** Equação da receita da base (clientes ativos × taxa de recompra × receita por cliente que recomprou) + leitura do gargalo. */
export const getRevenueEquation = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => inputSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isValidCommercialOrder, orderDate } = await import("./dashboard-metrics");
    const { computeEquationSeries, diagnoseEquation } = await import("./revenue-equation");
    const { GOALS } = await import("./crm-mock");

    const rows: any[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await (supabaseAdmin.from("shopify_orders") as any)
        .select("id, customer_id, total_price, processed_at, created_at, financial_status, cancelled_at")
        .not("customer_id", "is", null)
        .order("id", { ascending: true })
        .range(from, from + 999);
      if (error) throw new Error(`Erro ao ler pedidos: ${error.message}`);
      rows.push(...(page ?? []));
      if (!page || page.length < 1000) break;
    }

    const orders = rows
      .filter((r) => isValidCommercialOrder(r))
      .map((r) => ({ customerId: String(r.customer_id), at: orderDate(r), total: Number(r.total_price ?? 0) || 0 }))
      .filter((r) => r.at > 0);

    const series = computeEquationSeries(orders, data.windowDays, Date.now());
    const diagnosis = diagnoseEquation(series, GOALS.ticketMedio);
    return {
      windowDays: data.windowDays,
      windows: [...EQUATION_WINDOWS],
      current: series.current,
      previous: series.previous,
      referenceCount: series.references.length,
      firstOrderMs: series.firstOrderMs,
      ordersCount: orders.length,
      diagnosis,
    };
  });
