import { createServerFn } from "@tanstack/react-start";
import { startOfDay, endOfDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

const TZ = "America/Sao_Paulo";
// ShopifyQL (shopifyqlQuery) só existe a partir desta versão da Admin API.
const SHOPIFYQL_API_VERSION = "2025-10";

/** Coordenadas aproximadas das cidades mais comuns na base — usadas só pra plotar os
 *  marcadores do globo. Cidade fora dessa lista simplesmente não aparece no globo (a
 *  informação continua real e correta nas outras seções, só não tem coordenada). */
const CITY_COORDINATES: Record<string, [number, number]> = {
  "Belo Horizonte": [-43.9378, -19.9209],
  "São Paulo": [-46.6333, -23.5505],
  "Rio de Janeiro": [-43.1729, -22.9068],
  "Brasília": [-47.8828, -15.7942],
  "Curitiba": [-49.2733, -25.4284],
  "Salvador": [-38.5014, -12.9714],
  "Porto Alegre": [-51.2177, -30.0346],
  "Fortaleza": [-38.5267, -3.7319],
  "Goiânia": [-49.255, -16.6786],
  "Campinas": [-47.0626, -22.9099],
  "Recife": [-34.8811, -8.0476],
  "Manaus": [-60.0217, -3.1019],
  "Belém": [-48.4902, -1.4558],
  "Guarulhos": [-46.5333, -23.4538],
  "Sorocaba": [-47.4525, -23.5015],
  "Ribeirão Preto": [-47.8103, -21.1775],
  "Uberlândia": [-48.2772, -18.9186],
  "Contagem": [-44.0539, -19.9317],
  "Niterói": [-43.0964, -22.8833],
  "Santos": [-46.3336, -23.9608],
  "São José dos Campos": [-45.8869, -23.1791],
  "Juiz de Fora": [-43.3417, -21.7642],
  "Londrina": [-51.1628, -23.3103],
  "Florianópolis": [-48.5495, -27.5954],
  "Vitória": [-40.3128, -20.3155],
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type ShopifyQLRow = Record<string, string | undefined>;

let lastShopifyQLError: string | null = null;

/** Roda uma query ShopifyQL e devolve as linhas já como objetos simples {coluna: valor}.
 *  Guarda o último erro (parse ou GraphQL-level, ex: scope faltando) em `lastShopifyQLError`
 *  pra diagnóstico — `shopifyqlQuery` costuma falhar silenciosamente do ponto de vista da UI. */
async function runShopifyQL(query: string): Promise<ShopifyQLRow[]> {
  const { shopifyGraphQL } = await import("./shopify.server");
  const gql = `{ shopifyqlQuery(query: ${JSON.stringify(query)}) { tableData { columns { name } rows } parseErrors } }`;
  const result = await shopifyGraphQL(gql, undefined, SHOPIFYQL_API_VERSION);
  if (result?.errors?.length) {
    lastShopifyQLError = JSON.stringify(result.errors).slice(0, 500);
    console.error("ShopifyQL GraphQL error:", result.errors);
    return [];
  }
  const payload = result?.data?.shopifyqlQuery;
  if (payload?.parseErrors?.length) {
    lastShopifyQLError = JSON.stringify(payload.parseErrors).slice(0, 500);
    console.error("ShopifyQL parse error:", payload.parseErrors);
    return [];
  }
  const columns: { name: string }[] = payload?.tableData?.columns ?? [];
  const rows: string[][] = payload?.tableData?.rows ?? [];
  return rows.map((row) => Object.fromEntries(columns.map((c, i) => [c.name, row[i]])));
}

function num(v: string | undefined): number {
  return v ? Number(v) || 0 : 0;
}

export type LiveViewData = {
  visitantesAgora: number;
  sessoesHoje: number;
  visitantesUnicosHoje: number;
  carrinhosAtivosHoje: number;
  noCheckoutHoje: number;
  compradoHoje: number;
  pedidosHoje: number;
  faturamentoHoje: number;
  clientesNovosHoje: number;
  clientesRecorrentesHoje: number;
  sessoesPorLocal: { cidade: string; regiao: string; sessoes: number }[];
  topProdutosHoje: { nome: string; total: number }[];
  atividadeRecente: { tipo: "pedido" | "carrinho_abandonado"; cidade: string | null; valor: number | null; createdAt: string }[];
  marcadoresGlobo: { name: string; coordinates: [number, number]; type: "order" | "visitor" }[];
  /** Diagnóstico temporário — erro da última chamada ShopifyQL, se houver. Remover depois de confirmar que funciona. */
  shopifyqlDebugError?: string | null;
};

export const getLiveViewData = createServerFn({ method: "GET" }).handler(async (): Promise<LiveViewData> => {
  const supabaseAdmin = await admin();
  const now = toZonedTime(new Date(), TZ);
  const startISO = fromZonedTime(startOfDay(now), TZ).toISOString();
  const endISO = fromZonedTime(endOfDay(now), TZ).toISOString();

  // DEBUG temporário: confirma se o token do NOSSO app tem read_reports, e testa a query mínima.
  try {
    const { shopifyGraphQL } = await import("./shopify.server");
    const scopesResult = await shopifyGraphQL(`{ currentAppInstallation { accessScopes { handle } } }`);
    const scopes: string[] = scopesResult?.data?.currentAppInstallation?.accessScopes?.map((s: any) => s.handle) ?? [];
    const hasReadReports = scopes.includes("read_reports");

    const testGql = `{ shopifyqlQuery(query: "FROM sessions SHOW sessions DURING today") { tableData { columns { name } rows } parseErrors } }`;
    const testResult = await shopifyGraphQL(testGql, undefined, SHOPIFYQL_API_VERSION);

    lastShopifyQLError = JSON.stringify({ hasReadReports, testResult }).slice(0, 900);
  } catch (e) {
    lastShopifyQLError = "SCOPES_CHECK_FAILED: " + (e instanceof Error ? e.message : String(e));
  }

  const [funilRows, localRows, agoraRows] = await Promise.all([
    runShopifyQL(
      "FROM sessions SHOW sessions, online_store_visitors, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout DURING today",
    ),
    runShopifyQL("FROM sessions SHOW sessions GROUP BY session_region, session_city DURING today ORDER BY sessions DESC LIMIT 8"),
    runShopifyQL("FROM sessions SHOW sessions SINCE -5m UNTIL now"),
  ]);

  const funil = funilRows[0];
  const sessoesHoje = num(funil?.["sessions"]);
  const visitantesUnicosHoje = num(funil?.["online_store_visitors"]);
  const carrinhosAtivosHoje = num(funil?.["sessions_with_cart_additions"]);
  const noCheckoutHoje = num(funil?.["sessions_that_reached_checkout"]);
  const compradoHoje = num(funil?.["sessions_that_completed_checkout"]);
  const visitantesAgora = num(agoraRows[0]?.["sessions"]);

  const sessoesPorLocal = localRows.map((r) => ({
    cidade: r["session_city"] ?? "",
    regiao: r["session_region"] ?? "",
    sessoes: num(r["sessions"]),
  }));

  const { data: pedidosHojeRows } = await supabaseAdmin
    .from("shopify_orders")
    .select("id, customer_id, city, province, total_price, created_at, financial_status")
    .gte("created_at", startISO)
    .lte("created_at", endISO)
    .neq("financial_status", "VOIDED")
    .neq("financial_status", "REFUNDED");

  const orders = (pedidosHojeRows ?? []) as {
    id: string;
    customer_id: string | null;
    city: string | null;
    province: string | null;
    total_price: number;
    created_at: string;
  }[];

  const pedidosHoje = orders.length;
  const faturamentoHoje = orders.reduce((acc, o) => acc + Number(o.total_price ?? 0), 0);
  const orderIdsHoje = orders.map((o) => o.id);

  const [{ data: itensHoje }, { data: abandonosHoje }] = await Promise.all([
    orderIdsHoje.length > 0
      ? supabaseAdmin.from("shopify_order_items").select("title, price, quantity, order_id").in("order_id", orderIdsHoje)
      : Promise.resolve({ data: [] as { title: string; price: number; quantity: number }[] }),
    supabaseAdmin
      .from("shopify_abandoned_checkouts")
      .select("customer_id, city:shopify_customers(city), total_price, created_at")
      .gte("created_at", startISO)
      .lte("created_at", endISO)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  // Novo x recorrente: pra cada cliente que comprou hoje, conta o total de pedidos all-time dele.
  const customerIdsHoje = Array.from(new Set(orders.map((o) => o.customer_id).filter(Boolean))) as string[];
  let clientesNovosHoje = 0;
  let clientesRecorrentesHoje = 0;
  if (customerIdsHoje.length > 0) {
    const { data: allOrdersForThoseCustomers } = await supabaseAdmin
      .from("shopify_orders")
      .select("customer_id")
      .in("customer_id", customerIdsHoje);
    const countByCustomer = new Map<string, number>();
    for (const o of (allOrdersForThoseCustomers ?? []) as { customer_id: string | null }[]) {
      if (!o.customer_id) continue;
      countByCustomer.set(o.customer_id, (countByCustomer.get(o.customer_id) ?? 0) + 1);
    }
    for (const id of customerIdsHoje) {
      if ((countByCustomer.get(id) ?? 1) <= 1) clientesNovosHoje++;
      else clientesRecorrentesHoje++;
    }
  }

  // Top produtos: soma price*quantity por título entre os itens de pedidos de hoje.
  const totalByProduct = new Map<string, number>();
  for (const item of (itensHoje ?? []) as { title: string; price: number; quantity: number }[]) {
    const total = Number(item.price ?? 0) * Number(item.quantity ?? 0);
    totalByProduct.set(item.title, (totalByProduct.get(item.title) ?? 0) + total);
  }
  const topProdutosHoje = Array.from(totalByProduct.entries())
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  // Atividade recente: pedidos reais + carrinhos abandonados reais de hoje, intercalados por data.
  const atividadePedidos = orders
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6)
    .map((o) => ({
      tipo: "pedido" as const,
      cidade: [o.city, o.province].filter(Boolean).join(", ") || null,
      valor: Number(o.total_price ?? 0),
      createdAt: o.created_at,
    }));
  const atividadeCarrinhos = ((abandonosHoje ?? []) as any[]).map((a) => ({
    tipo: "carrinho_abandonado" as const,
    cidade: (a.city?.city as string | undefined) ?? null,
    valor: a.total_price != null ? Number(a.total_price) : null,
    createdAt: a.created_at as string,
  }));
  const atividadeRecente = [...atividadePedidos, ...atividadeCarrinhos]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  // Marcadores do globo: cidades de sessões (visitor) + cidades de pedidos de hoje (order), reais.
  const marcadoresGlobo: LiveViewData["marcadoresGlobo"] = [];
  const seen = new Set<string>();
  for (const o of orders) {
    const coords = o.city ? CITY_COORDINATES[o.city] : undefined;
    if (!o.city || !coords || seen.has(o.city)) continue;
    seen.add(o.city);
    marcadoresGlobo.push({ name: o.city, coordinates: coords, type: "order" });
  }
  for (const s of sessoesPorLocal) {
    const coords = s.cidade ? CITY_COORDINATES[s.cidade] : undefined;
    if (!s.cidade || !coords || seen.has(s.cidade)) continue;
    seen.add(s.cidade);
    marcadoresGlobo.push({ name: s.cidade, coordinates: coords, type: "visitor" });
  }

  return {
    visitantesAgora,
    sessoesHoje,
    visitantesUnicosHoje,
    carrinhosAtivosHoje,
    noCheckoutHoje,
    compradoHoje,
    pedidosHoje,
    faturamentoHoje,
    clientesNovosHoje,
    clientesRecorrentesHoje,
    sessoesPorLocal,
    topProdutosHoje,
    atividadeRecente,
    marcadoresGlobo,
    shopifyqlDebugError: lastShopifyQLError,
  };
});
