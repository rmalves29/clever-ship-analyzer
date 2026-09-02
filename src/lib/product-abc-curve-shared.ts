export type AbcTier = "A" | "B" | "C";

export type ProductAbcInput = {
  key: string;
  productId: string | null;
  variantId: string | null;
  sku: string | null;
  nome: string;
  variacao: string | null;
  valorVendido: number;
  quantidadeVendida: number;
};

export type ProductAbcRow = ProductAbcInput & {
  curvaReceita: AbcTier;
  curvaItens: AbcTier;
};

/** Curva ABC clássica: A = itens até 80% acumulado, B = até 95%, C = o resto. A classificação de
 *  cada item olha o quanto já foi acumulado ANTES dele (não depois) — assim o item líder isolado
 *  sempre cai em A mesmo quando ele sozinho já responde por boa parte do total, em vez de virar C
 *  só por ultrapassar o corte sozinho. Ranking próprio por métrica (ordem descendente) — cada
 *  linha usa a curva calculada pela SUA métrica, não pela ordem de exibição final da tabela. */
function classifyByMetric(rows: ProductAbcInput[], metric: (row: ProductAbcInput) => number): Map<string, AbcTier> {
  const sorted = [...rows].sort((a, b) => metric(b) - metric(a));
  const total = sorted.reduce((sum, row) => sum + metric(row), 0);
  const tierByKey = new Map<string, AbcTier>();
  let cumulativeBefore = 0;
  for (const row of sorted) {
    const pctBefore = total > 0 ? cumulativeBefore / total : 0;
    tierByKey.set(row.key, pctBefore < 0.8 ? "A" : pctBefore < 0.95 ? "B" : "C");
    cumulativeBefore += metric(row);
  }
  return tierByKey;
}

/** Monta a curva ABC por receita e por itens vendidos (cada uma com seu próprio ranking interno),
 *  mas a lista final sempre volta ordenada por receita — do maior pro menor faturamento. */
export function computeProductAbcCurve(rows: ProductAbcInput[]): ProductAbcRow[] {
  const tierByRevenue = classifyByMetric(rows, (r) => r.valorVendido);
  const tierByQuantity = classifyByMetric(rows, (r) => r.quantidadeVendida);
  return rows
    .map((row) => ({
      ...row,
      curvaReceita: tierByRevenue.get(row.key) ?? "C",
      curvaItens: tierByQuantity.get(row.key) ?? "C",
    }))
    .sort((a, b) => b.valorVendido - a.valorVendido);
}
