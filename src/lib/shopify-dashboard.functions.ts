import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { z } from "zod";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, startOfWeek, subMonths, eachMonthOfInterval } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import {
  MATURE_HISTORY_DAYS,
  MIN_SAMPLE,
  VALID_FINANCIAL_STATUSES,
  buildCustomerAggregates,
  buildFirstFulfillmentByOrder,
  computeCohort,
  computeCommercialKpis,
  computeCurvaRecompra,
  computeFaixaTicket,
  computeFrequencyDistribution,
  computeGapsPrimeiraSegunda,
  computeHistoryDaysFromOrders,
  computePedidosPorLanding,
  computeRegioesRecompra,
  computeRetencaoPorEstagio,
  computeTaxaRecompra,
  computeTempoEntreCompras,
  computeTempoMedioEnvio,
  computeTicketRecorrencia,
  computeValorAcumulado,
  filterValidOrders,
} from "./dashboard-metrics";
import { computeProductAbcCurve, type ProductAbcInput } from "./product-abc-curve-shared";

const TZ = "America/Sao_Paulo";

const dashboardInput = z.object({
  period: z.enum(["diario", "semanal", "mensal", "anual", "tudo", "personalizado"]),
  range: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
  }).optional(),
});

export type DashboardPeriod = z.infer<typeof dashboardInput>;

/**
 * Lógica do dashboard. TODAS as métricas usam a mesma regra de pedido válido
 * (`dashboard-metrics.ts` → `crm-rfm-shared.ts`): apenas PAID/PARTIALLY_PAID e não cancelados.
 */
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

    const { getBestSellingProducts } = await import("./shopify-products.server");

    const validStatuses = [...VALID_FINANCIAL_STATUSES];

    // Buscas independentes rodam em paralelo. O filtro de status já vai no banco;
    // o filtro de cancelamento (raw_data.cancelledAt) é reaplicado em memória.
    const [{ data: orders }, { data: fulfillments }, { data: allOrders }, bestSellers] = await Promise.all([
      supabaseAdmin
        .from("shopify_orders")
        .select("id, customer_id, total_price, processed_at, created_at, province, financial_status, landing_site, raw_data")
        .gte("processed_at", startISO)
        .lte("processed_at", endISO)
        .in("financial_status", validStatuses),
      supabaseAdmin
        .from("shopify_fulfillments")
        .select("order_id, created_at, updated_at, tracking_number, shopify_orders!inner(processed_at, financial_status)")
        .not("tracking_number", "is", null)
        .gte("created_at", startISO)
        .lte("created_at", endISO),
      supabaseAdmin
        .from("shopify_orders")
        .select("customer_id, total_price, processed_at, created_at, province, financial_status, raw_data")
        .lte("processed_at", endISO)
        .in("financial_status", validStatuses),
      getBestSellingProducts({ startISO, endISO, limit: 5 }).catch(() => []),
    ]);

    if (!orders) throw new Error("Falha ao ler pedidos");

    const validOrders = filterValidOrders(orders as any[]);
    const { faturamento, numPedidos, ticketMedio, uniqueCustomers, receitaPorCliente } =
      computeCommercialKpis(validOrders);

    // ---------- Curva ABC de produtos (por receita e por itens vendidos) ----------
    const validOrderIds = validOrders.map((o: any) => o.id as string);
    let curvaAbcProdutos: ReturnType<typeof computeProductAbcCurve> = [];
    if (validOrderIds.length > 0) {
      const { data: abcItems } = await supabaseAdmin
        .from("shopify_order_items")
        .select("product_id, variant_id, title, variant_title, sku, quantity, price")
        .in("order_id", validOrderIds);

      const abcByKey = new Map<string, ProductAbcInput>();
      for (const item of (abcItems ?? []) as {
        product_id: string | null;
        variant_id: string | null;
        title: string;
        variant_title: string | null;
        sku: string | null;
        quantity: number | null;
        price: number | null;
      }[]) {
        const key = item.variant_id ?? item.product_id ?? `title:${item.title}`;
        const slot = abcByKey.get(key) ?? {
          key,
          productId: item.product_id,
          variantId: item.variant_id,
          sku: item.sku,
          nome: item.title,
          variacao: item.variant_title,
          valorVendido: 0,
          quantidadeVendida: 0,
        };
        const quantity = Number(item.quantity ?? 0);
        slot.valorVendido += Number(item.price ?? 0) * quantity;
        slot.quantidadeVendida += quantity;
        abcByKey.set(key, slot);
      }
      curvaAbcProdutos = computeProductAbcCurve(Array.from(abcByKey.values()));
    }

    // Envios: só de pedidos válidos (pedido reembolsado/cancelado não conta como operação boa).
    const validFulfillments = (fulfillments ?? []).filter((f: any) =>
      f.shopify_orders && (validStatuses as string[]).includes(String(f.shopify_orders.financial_status ?? "").toUpperCase()),
    );

    const shippedOrderIds = Array.from(
      new Set(validFulfillments.map((f: any) => f.order_id).filter(Boolean) as string[]),
    );
    const pedidosEnviadosCount = shippedOrderIds.length;

    let shippedItems: { quantity: number | null; order_id: string | null }[] = [];
    if (shippedOrderIds.length > 0) {
      const { data: items } = await supabaseAdmin
        .from("shopify_order_items")
        .select("quantity, order_id")
        .in("order_id", shippedOrderIds);
      shippedItems = items ?? [];
    }
    const produtosEnviadosCount = shippedItems.reduce((acc, i) => acc + (i.quantity ?? 0), 0);

    const processedAtByOrder = new Map<string, string | null>();
    for (const f of validFulfillments as any[]) {
      if (f.order_id) processedAtByOrder.set(f.order_id, f.shopify_orders?.processed_at ?? null);
    }
    const firstFulfillmentByOrder = buildFirstFulfillmentByOrder(validFulfillments as any[], processedAtByOrder);
    const { tempoMedioEnvioHoras, tempoMedioEnvioDias, amostra: countWithTime } =
      computeTempoMedioEnvio(firstFulfillmentByOrder);

    // Base histórica (todos os pedidos válidos até o fim do período) para métricas de ciclo de vida.
    const customers = buildCustomerAggregates((allOrders ?? []) as any[]);
    const historicValidOrders = filterValidOrders((allOrders ?? []) as any[]);
    const historyDays = computeHistoryDaysFromOrders(historicValidOrders, Date.now());
    const baseMadura = historyDays >= MATURE_HISTORY_DAYS;

    const frequencia = computeFrequencyDistribution(customers);
    const clv = computeValorAcumulado(customers);
    const ticketRecorrencia = computeTicketRecorrencia(customers);
    const faixaTicket = computeFaixaTicket(validOrders);
    const regioes = computeRegioesRecompra(customers, MIN_SAMPLE);
    const churn = computeRetencaoPorEstagio(customers);
    const gapsDias = computeGapsPrimeiraSegunda(customers);
    const tempoEntreCompras = computeTempoEntreCompras(gapsDias);
    const curvaRecompra = computeCurvaRecompra(gapsDias);
    const { taxaRecompra, recomprasCount, baseClientes } = computeTaxaRecompra(customers);

    // Envios por dia da semana (com base no created_at do fulfillment).
    const diasLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const perDay = new Map<number, { pedidos: Set<string>; horas: number[] }>();
    for (const f of validFulfillments as any[]) {
      const at = f.created_at ?? f.updated_at;
      if (!f.order_id || !at) continue;
      const d = toZonedTime(new Date(at), TZ).getDay();
      const slot = perDay.get(d) ?? { pedidos: new Set<string>(), horas: [] };
      slot.pedidos.add(f.order_id);
      const processedAt = f.shopify_orders?.processed_at ?? null;
      if (processedAt) {
        const h = (new Date(at).getTime() - new Date(processedAt).getTime()) / 3_600_000;
        if (h >= 0 && h <= 24 * 90) slot.horas.push(h);
      }
      perDay.set(d, slot);
    }
    const itemsByOrder = new Map<string, number>();
    for (const it of shippedItems) {
      if (!it.order_id) continue;
      itemsByOrder.set(it.order_id, (itemsByOrder.get(it.order_id) ?? 0) + (it.quantity ?? 0));
    }
    const enviosPorDia = [1, 2, 3, 4, 5, 6, 0].map((d) => {
      const slot = perDay.get(d);
      const pedidosIds = Array.from(slot?.pedidos ?? []);
      const horas = slot?.horas ?? [];
      return {
        dia: diasLabels[d]!,
        pedidos: pedidosIds.length,
        produtos: pedidosIds.reduce((a, id) => a + (itemsByOrder.get(id) ?? 0), 0),
        tempoMedio: Number((horas.length ? horas.reduce((a, h) => a + h, 0) / horas.length / 24 : 0).toFixed(2)),
      };
    });

    // ---------- Coorte (por mês de 1ª compra válida) ----------
    const monthsInterval = eachMonthOfInterval({ start: startOfMonth(subMonths(now, 7)), end: endOfMonth(now) });
    const ptBRModule = await import("date-fns/locale/pt-BR");
    const ptBR = (ptBRModule as any).default || ptBRModule;
    const cohortData = computeCohort(
      customers,
      monthsInterval.map((m) => ({
        start: startOfMonth(m).getTime(),
        end: endOfMonth(m).getTime(),
        label: format(m, "MMM 'de' yyyy", { locale: ptBR }),
      })),
    );

    // ---------- Pedidos por página de entrada (NÃO é sessão) ----------
    const sessoes = computePedidosPorLanding(validOrders, 10);

    return {
      faturamento,
      numPedidos,
      ticketMedio,
      uniqueCustomers,
      receitaPorCliente,
      pedidosEnviadosCount,
      produtosEnviadosCount,
      tempoMedioEnvioDias,
      tempoMedioEnvioHoras,
      tempoMedioEnvioAmostra: countWithTime,
      taxaRecompra,
      recomprasCount,
      totalClientesBase: baseClientes,
      historyDays,
      baseMadura,
      minSample: MIN_SAMPLE,
      gapsAmostra: gapsDias.length,
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
      sessoes,
      produtosMaisVendidos: bestSellers.map((p) => ({
        productId: p.productId,
        nome: p.title,
        quantidade: p.quantity,
        faturamento: p.revenue,
      })),
      curvaAbcProdutos,
    };
}

export const getShopifyDashboardData = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => dashboardInput.parse(data))
  .handler(async ({ data }) => computeShopifyDashboardData(data));
