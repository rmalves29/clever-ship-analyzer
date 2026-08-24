import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";
import { buildRepurchaseCohorts, buildRepurchaseJourney, summarizeRepurchase, type RepurchaseWindow } from "./crm-repurchase-shared";

async function loadRepurchaseData() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: orders, error: ordersError }, { data: customers, error: customersError }] = await Promise.all([
    supabaseAdmin.from("shopify_orders").select("id,customer_id,total_price,processed_at,created_at,financial_status,cancelled_at"),
    supabaseAdmin.from("shopify_customers").select("id,first_name,last_name,email,phone,city,province,tags"),
  ]);
  if (ordersError) throw ordersError;
  if (customersError) throw customersError;
  const journey = buildRepurchaseJourney((orders ?? []).map((o: any) => ({
    id: String(o.id), customerId: String(o.customer_id ?? ""), totalPrice: Number(o.total_price ?? 0),
    processedAt: o.processed_at ?? o.created_at, financialStatus: o.financial_status, cancelledAt: o.cancelled_at,
  })));
  const customerMap = new Map((customers ?? []).map((c: any) => [String(c.id), c]));
  return { journey, customerMap };
}

export const getRepurchaseDashboard = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { journey } = await loadRepurchaseData();
    return { summary: summarizeRepurchase(journey), cohorts: buildRepurchaseCohorts(journey) };
  });

export const getRepurchaseCustomers = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => z.object({ stage: z.string().optional(), search: z.string().optional() }).parse(input))
  .handler(async ({ data }) => {
    const { journey, customerMap } = await loadRepurchaseData();
    const needle = (data.search ?? "").trim().toLowerCase();
    return journey
      .filter((row) => !data.stage || row.stage === data.stage)
      .map((row) => {
        const c: any = customerMap.get(row.customerId) ?? {};
        const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || "Cliente";
        return { ...row, name, city: c.city ?? null, province: c.province ?? null };
      })
      .filter((row) => !needle || row.name.toLowerCase().includes(needle) || row.customerId.toLowerCase().includes(needle));
  });

export const getRepurchaseCampaignContext = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => z.object({ stage: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const { journey } = await loadRepurchaseData();
    const rows = journey.filter((x) => !x.converted && x.stage === data.stage);
    const avgTicket = rows.length ? rows.reduce((s, x) => s + x.firstOrderRevenue, 0) / rows.length : 0;
    return {
      audience: "1ª compra → 2ª compra",
      stage: data.stage as RepurchaseWindow,
      customerCount: rows.length,
      averageFirstOrderTicket: avgTicket,
      averageDaysSinceFirstOrder: rows.length ? rows.reduce((s, x) => s + x.daysSinceFirstOrder, 0) / rows.length : 0,
      allowedActions: ["draft_campaign", "ai_suggestion"],
      sendingEnabled: false,
      note: "Contexto somente para rascunho/aprovação humana. Nenhum envio é executado por esta função.",
    };
  });
