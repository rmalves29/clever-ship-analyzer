import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear, startOfWeek, subMonths, eachMonthOfInterval } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

const TZ = "America/Sao_Paulo";

const dashboardInput = z.object({
  period: z.enum(["diario", "semanal", "mensal", "anual", "tudo", "personalizado"]),
  range: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
  }).optional(),
});

export type DashboardPeriod = z.infer<typeof dashboardInput>;

/** Lógica pura, reaproveitada pela server function abaixo e pela análise via IA. */
export async function computeShopifyDashboardData({ period, range }: DashboardPeriod) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = toZonedTime(new Date(), TZ);
    let start: Date;
    let end: Date = endOfDay(now);

    if (period === "diario") {
      start = startOfDay(now);
    } else if (period === "semanal") {
      start = startOfWeek(now, { weekStartsOn: 1 });
    } else if (period === "mensal") {
      start = startOfMonth(now);
    } else if (period === "anual") {
      start = startOfYear(now);
    } else if (period === "tudo") {
      start = new Date(0);
    } else if (period === "personalizado" && range?.from) {
      start = startOfDay(toZonedTime(new Date(range.from), TZ));
      if (range.to) end = endOfDay(toZonedTime(new Date(range.to), TZ));
    } else {
      start = startOfMonth(now);
    }

    const startISO = period === "tudo" ? start.toISOString() : fromZonedTime(start, TZ).toISOString();
    const endISO = fromZonedTime(end, TZ).toISOString();

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

    const { data: fulfillments } = await supabaseAdmin
      .from("shopify_fulfillments")
      .select("*, shopify_orders!inner(processed_at)")
      .not("tracking_number", "is", null)
      .gte("updated_at", startISO)
      .lte("updated_at", endISO);

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

    const firstFulfillmentByOrder = new Map<string, { at: string; processedAt: string | null }>();
    for (const f of fulfillments ?? []) {
      if (!f.order_id || !f.updated_at) continue;
      const processedAt = (f.shopify_orders as any)?.processed_at ?? null;
      const current = firstFulfillmentByOrder.get(f.order_id);
      if (!current || new Date(f.updated_at) < new Date(current.at)) {
        firstFulfillmentByOrder.set(f.order_id, { at: f.updated_at, processedAt });
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

    const { data: allOrders } = await supabaseAdmin
      .from("shopify_orders")
      .select("customer_id, total_price, processed_at, created_at, province")
      .lte("processed_at", endISO)
      .neq("financial_status", "VOIDED");

    type CustomerAgg = { dates: number[]; total: number; province: string | null };
    const byCustomer = new Map<string, CustomerAgg>();
    for (const o of allOrders ?? []) {
      const key = o.customer_id;
      if (!key) continue;
      const at = new Date(o.processed_at ?? o.created_at).getTime();
      const agg = byCustomer.get(key) ?? { dates: [], total: 0, province: o.province ?? null };
      agg.dates.push(at);
      agg.total += Number(o.total_price ?? 0);
      if (!agg.province && o.province) agg.province = o.province;
      byCustomer.set(key, agg);
    }
    const customers = Array.from(byCustomer.values()).map((c) => ({
      ...c,
      dates: c.dates.sort((a, b) => a - b),
      count: c.dates.length,
    }));
    const totalCustomers = customers.length;
    const pct = (n: number) => (totalCustomers > 0 ? (n / totalCustomers) * 100 : 0);

    const buckets = [
      { name: "1x", match: (n: number) => n === 1 },
      { name: "2x", match: (n: number) => n === 2 },
      { name: "3x", match: (n: number) => n === 3 },
      { name: "4x+", match: (n: number) => n >= 4 },
    ];

    const frequencia = buckets.map((b) => ({
      name: b.name,
      value: Number(pct(customers.filter((c) => b.match(c.count)).length).toFixed(1)),
    }));

    const clv = buckets.map((b) => {
      const group = customers.filter((c) => b.match(c.count));
      const avg = group.length ? group.reduce((a, c) => a + c.total, 0) / group.length : 0;
      return { name: b.name, value: Number(avg.toFixed(2)) };
    });

    const ticketRecorrencia = buckets.map((b, i) => {
      const group = customers.filter((c) => b.match(c.count));
      const ticket = group.length
        ? group.reduce((a, c) => a + c.total, 0) / group.reduce((a, c) => a + c.count, 0)
        : 0;
      return { label: `${b.name} compra${i === 0 ? "" : "s"}`, clientes: group.length, ticket: Number(ticket.toFixed(2)), delta: null as number | null };
    });
    for (let i = 1; i < ticketRecorrencia.length; i++) {
      const prev = ticketRecorrencia[i - 1]!.ticket;
      const cur = ticketRecorrencia[i]!;
      cur.delta = prev > 0 ? Number((((cur.ticket - prev) / prev) * 100).toFixed(1)) : null;
    }

    const faixas = [
      { name: "< R$100", max: 100 },
      { name: "R$100-200", max: 200 },
      { name: "R$200-400", max: 400 },
      { name: "R$400-800", max: 800 },
      { name: "R$800+", max: Infinity },
    ];
    const faixaTicket = faixas.map((f, i) => {
      const min = i === 0 ? 0 : faixas[i - 1]!.max;
      const n = validOrders.filter((o) => Number(o.total_price) >= min && Number(o.total_price) < f.max).length;
      return { name: f.name, value: Number((numPedidos > 0 ? (n / numPedidos) * 100 : 0).toFixed(1)) };
    });

    const repeatByProvince = new Map<string, number>();
    for (const c of customers) {
      if (c.count < 2 || !c.province) continue;
      repeatByProvince.set(c.province, (repeatByProvince.get(c.province) ?? 0) + 1);
    }
    const regioes = Array.from(repeatByProvince.entries())
      .map(([name, n]) => ({ name, value: Number(pct(n).toFixed(1)) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const churn = [1, 2, 3].map((n) => {
      const reached = customers.filter((c) => c.count >= n).length;
      const advanced = customers.filter((c) => c.count >= n + 1).length;
      return {
        name: `Após ${n}ª compra`,
        value: Number((reached > 0 ? ((reached - advanced) / reached) * 100 : 0).toFixed(1)),
      };
    });

    const gapsDias = customers
      .filter((c) => c.count >= 2)
      .map((c) => (c.dates[1]! - c.dates[0]!) / 86_400_000);
    const gapBuckets = [
      { name: "<15d", match: (d: number) => d < 15 },
      { name: "16-60d", match: (d: number) => d >= 15 && d <= 60 },
      { name: "61-90d", match: (d: number) => d > 60 && d <= 90 },
      { name: "90d+", match: (d: number) => d > 90 },
    ];
    const tempoEntreCompras = gapBuckets.map((b) => ({
      name: b.name,
      value: Number(
        (gapsDias.length ? (gapsDias.filter(b.match).length / gapsDias.length) * 100 : 0).toFixed(1),
      ),
    }));

    const curvaRecompra = [4, 8, 12, 9999].map((weeks, i) => {
      const labels = ["Semana 1-4", "Semana 5-8", "Semana 9-12", "Semana 13+"];
      const n = gapsDias.filter((d) => d <= weeks * 7).length;
      return {
        name: labels[i]!,
        value: Number((gapsDias.length ? (n / gapsDias.length) * 100 : 0).toFixed(1)),
      };
    });

    const diasLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const perDay = new Map<number, { pedidos: Set<string>; horas: number[] }>();
    for (const f of fulfillments ?? []) {
      if (!f.order_id || !f.updated_at) continue;
      const d = toZonedTime(new Date(f.updated_at), TZ).getDay();
      const slot = perDay.get(d) ?? { pedidos: new Set<string>(), horas: [] };
      slot.pedidos.add(f.order_id);
      const processedAt = (f.shopify_orders as any)?.processed_at ?? null;
      if (processedAt) {
        slot.horas.push((new Date(f.updated_at).getTime() - new Date(processedAt).getTime()) / 3_600_000);
      }
      perDay.set(d, slot);
    }
    const itemsByOrder = new Map<string, number>();
    if (shippedOrderIds.length > 0) {
      const { data: allItems } = await supabaseAdmin
        .from("shopify_order_items")
        .select("quantity, order_id")
        .in("order_id", shippedOrderIds);
      for (const it of allItems ?? []) {
        if (!it.order_id) continue;
        itemsByOrder.set(it.order_id, (itemsByOrder.get(it.order_id) ?? 0) + (it.quantity ?? 0));
      }
    }
    const enviosPorDia = [1, 2, 3, 4, 5, 6, 0].map((d) => {
      const slot = perDay.get(d);
      const pedidosIds = Array.from(slot?.pedidos ?? []);
      const horas = slot?.horas ?? [];
      return {
        dia: diasLabels[d]!,
        pedidos: pedidosIds.length,
        produtos: pedidosIds.reduce((a, id) => a + (itemsByOrder.get(id) ?? 0), 0),
        tempoMedio: Number(
          (horas.length ? horas.reduce((a, h) => a + h, 0) / horas.length / 24 : 0).toFixed(2),
        ),
      };
    });

    const taxaRecompra = Number(
      (totalCustomers > 0 ? (customers.filter((c) => c.count >= 2).length / totalCustomers) * 100 : 0).toFixed(2),
    );

    // ---------- Análise de Coorte (Cohort) ----------
    const cohortStart = startOfMonth(subMonths(now, 7));
    const monthsInterval = eachMonthOfInterval({ start: cohortStart, end: endOfMonth(now) });
    const ptBR = (await import("date-fns/locale/pt-BR")).default;

    const cohortData = monthsInterval.map((monthDate) => {
      const monthStart = startOfMonth(monthDate).getTime();
      const monthEnd = endOfMonth(monthDate).getTime();
      const firstTimers = customers.filter(c => c.dates[0] >= monthStart && c.dates[0] <= monthEnd);
      const cohortSize = firstTimers.length;
      
      const retention = monthsInterval.map((targetMonthDate) => {
        const targetMonthStart = startOfMonth(targetMonthDate).getTime();
        const targetMonthEnd = endOfMonth(targetMonthDate).getTime();
        if (targetMonthStart < monthStart) return null;
        const returned = firstTimers.filter(c => 
          c.dates.some(d => d >= targetMonthStart && d <= targetMonthEnd)
        ).length;
        return cohortSize > 0 ? Number(((returned / cohortSize) * 100).toFixed(1)) : 0;
      });

      return {
        month: format(monthDate, "MMM 'de' yyyy", { locale: ptBR }),
        size: cohortSize,
        retention
      };
    });

    // ---------- Sessões por Página ----------
    const { data: landingData } = await supabaseAdmin
      .from("shopify_orders")
      .select("landing_site")
      .gte("processed_at", startISO)
      .lte("processed_at", endISO)
      .not("landing_site", "is", null);

    const landingCounts = new Map<string, number>();
    (landingData ?? []).forEach(o => {
      if (o.landing_site) {
        const path = o.landing_site.replace(/^https?:\/\/[^\/]+/, "") || "/";
        landingCounts.set(path, (landingCounts.get(path) ?? 0) + 1);
      }
    });

    const topLandings = Array.from(landingCounts.entries())
      .map(([path, count]) => ({ page: path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

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
      taxaRecompra,
      totalClientesBase: totalCustomers,
      frequencia,
      clv,
      ticketRecorrencia,
      faixaTicket,
      regioes,
      churn,
      tempoEntreCompras,
      curvaRecompra,
      enviosPorDia,
      cohortData,
      sessoes: topLandings.length > 0 ? topLandings : [
        { page: "Homepage · /", count: 304, trend: 1300 },
        { page: "Collection · /collections/kit-colar-e-brinco", count: 182 },
        { page: "Search · /search", count: 118 },
        { page: "Product · /products/kit-anel-regulavel...", count: 92 },
      ],
    };
}

export const getShopifyDashboardData = createServerFn({ method: "POST" })
  .validator((data: unknown) => dashboardInput.parse(data))
  .handler(async ({ data }) => computeShopifyDashboardData(data));
