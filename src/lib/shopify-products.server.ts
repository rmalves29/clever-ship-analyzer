async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type BestSellingProduct = {
  productId: string | null; // null só pra linhas legadas sem product_id capturado no sync
  title: string;
  quantity: number;
  revenue: number;
};

/** Produtos mais vendidos num período — usado tanto pelo Dashboard (qualquer período) quanto
 *  pelo lote de IA (janela fixa "semana anterior"). Agrega por product_id quando disponível;
 *  cai pra agrupar por title quando não (dado legado, pré-captura de product_id/variant_id). */
export async function getBestSellingProducts(params: {
  startISO: string;
  endISO: string;
  limit?: number;
}): Promise<BestSellingProduct[]> {
  const limit = params.limit ?? 5;
  const supabaseAdmin = await admin();

  const { data: orders } = await supabaseAdmin
    .from("shopify_orders")
    .select("id")
    .gte("processed_at", params.startISO)
    .lte("processed_at", params.endISO)
    .neq("financial_status", "VOIDED")
    .neq("financial_status", "REFUNDED");

  const orderIds = (orders ?? []).map((o: any) => o.id as string);
  if (orderIds.length === 0) return [];

  const { data: items } = await supabaseAdmin
    .from("shopify_order_items")
    .select("product_id, title, quantity, price")
    .in("order_id", orderIds);

  const byKey = new Map<string, BestSellingProduct>();
  for (const item of (items ?? []) as { product_id: string | null; title: string; quantity: number; price: number }[] ) {
    const key = item.product_id ?? `title:${item.title}`;
    const slot = byKey.get(key) ?? { productId: item.product_id, title: item.title, quantity: 0, revenue: 0 };
    slot.quantity += Number(item.quantity ?? 0);
    slot.revenue += Number(item.price ?? 0) * Number(item.quantity ?? 0);
    byKey.set(key, slot);
  }

  return Array.from(byKey.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit);
}

export type MostVisitedProduct = {
  productId: string;
  handle: string;
  title: string;
  sessions: number;
  detail: import("./shopify.server").ShopifyProductDetail;
};

const PRODUCT_PATH_RE = /^\/products\/([^/?]+)/;

/** Produto mais ACESSADO (sessões que aterrissaram direto na página) via ShopifyQL, com
 *  resolução handle -> produto real via Admin API. Suporta excluir uma lista de product_ids
 *  (pra nunca coincidir com os produtos mais vendidos) — pula pro próximo até achar um
 *  diferente. Mede sessões que aterrissaram na página, não toda navegação interna — limitação
 *  real do ShopifyQL (sessions só expõe página de entrada), aceita como aproximação válida. */
export async function getMostVisitedProducts(params: {
  sinceDate: string; // "YYYY-MM-DD"
  untilDate: string; // "YYYY-MM-DD"
  excludeProductIds?: string[];
  limit?: number;
}): Promise<MostVisitedProduct[]> {
  const limit = params.limit ?? 1;
  const exclude = new Set(params.excludeProductIds ?? []);

  const { runShopifyQL } = await import("./shopify-live-view.functions");
  const rows = await runShopifyQL(
    `FROM sessions SHOW sessions GROUP BY landing_page_path WHERE landing_page_type = 'Product' SINCE '${params.sinceDate}' UNTIL '${params.untilDate}' ORDER BY sessions DESC LIMIT 10`,
  );

  const { getShopifyProductByHandle } = await import("./shopify.server");
  const results: MostVisitedProduct[] = [];

  for (const row of rows) {
    if (results.length >= limit) break;
    const path = row["landing_page_path"];
    const sessions = Number(row["sessions"] ?? 0);
    const handle = path ? PRODUCT_PATH_RE.exec(path)?.[1] : undefined;
    if (!handle) continue;

    const detail = await getShopifyProductByHandle(handle);
    if (!detail || exclude.has(detail.id)) continue;

    results.push({ productId: detail.id, handle, title: detail.title, sessions, detail });
  }

  return results;
}
