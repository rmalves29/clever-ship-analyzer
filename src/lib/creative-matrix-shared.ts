/**
 * Matriz criativa — lógica pura (sem banco, sem rede), compartilhada entre servidor, tela e testes.
 *
 * A IA só CLASSIFICA cada peça (ângulo da mensagem + categoria de produto). Todas as contas da
 * matriz (médias, taxas, ROAS) são feitas aqui, em código, a partir das métricas reais.
 */

export const ANGLES = [
  "novidade",
  "promocao_cupom",
  "urgencia_escassez",
  "prova_social",
  "presente_ocasiao",
  "educativo_dica",
  "bastidores_marca",
  "inspiracao_lifestyle",
  "outro",
] as const;
export type Angle = (typeof ANGLES)[number];

export const ANGLE_LABEL: Record<Angle, string> = {
  novidade: "Novidade",
  promocao_cupom: "Promoção / cupom",
  urgencia_escassez: "Urgência / escassez",
  prova_social: "Prova social",
  presente_ocasiao: "Presente / ocasião",
  educativo_dica: "Dica / educativo",
  bastidores_marca: "Bastidores / marca",
  inspiracao_lifestyle: "Inspiração / look",
  outro: "Outro",
};

export const CATEGORIES = ["brinco", "colar", "anel", "pulseira", "kit_conjunto", "geral"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  brinco: "Brinco",
  colar: "Colar",
  anel: "Anel",
  pulseira: "Pulseira",
  kit_conjunto: "Kit / conjunto",
  geral: "Geral",
};

export type PostFormat = "Reels" | "Carrossel" | "Foto" | "Vídeo";
export const POST_FORMATS: PostFormat[] = ["Reels", "Carrossel", "Foto", "Vídeo"];

export function formatOfPost(productType: string | null | undefined, mediaType: string | null | undefined): PostFormat {
  const product = (productType ?? "").toUpperCase();
  const media = (mediaType ?? "").toUpperCase();
  if (product === "REELS") return "Reels";
  if (media === "CAROUSEL_ALBUM") return "Carrossel";
  if (media === "VIDEO") return "Vídeo";
  return "Foto";
}

export function normalizeAngle(value: unknown): Angle {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (ANGLES as readonly string[]).includes(v) ? (v as Angle) : "outro";
}

export function normalizeCategory(value: unknown): Category {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (CATEGORIES as readonly string[]).includes(v) ? (v as Category) : "geral";
}

/* ----------------------------------------------------------------- postagens */

export type PostMetrics = {
  id: string;
  reach: number;
  views: number;
  totalInteractions: number;
  saved: number;
  shares: number;
};

export type ClassifiedPost = PostMetrics & {
  format: PostFormat;
  angle: Angle;
  category: Category;
  mentionsPrice: boolean;
};

export type PostCell = {
  n: number;
  /** Alcance médio por post. */
  avgReach: number;
  /** Interações totais ÷ alcance total (0–1). `null` quando não há alcance. */
  engagementRate: number | null;
  /** Salvamentos + compartilhamentos médios por post — os sinais mais fortes de interesse. */
  avgSavesShares: number;
};

function emptyPostCell(): PostCell {
  return { n: 0, avgReach: 0, engagementRate: null, avgSavesShares: 0 };
}

export function summarizePosts(posts: PostMetrics[]): PostCell {
  if (posts.length === 0) return emptyPostCell();
  const reach = posts.reduce((a, p) => a + p.reach, 0);
  const inter = posts.reduce((a, p) => a + p.totalInteractions, 0);
  const ss = posts.reduce((a, p) => a + p.saved + p.shares, 0);
  return {
    n: posts.length,
    avgReach: reach / posts.length,
    engagementRate: reach > 0 ? inter / reach : null,
    avgSavesShares: ss / posts.length,
  };
}

export type PostMatrix = {
  formats: PostFormat[];
  angles: Angle[];
  /** Chave `${format}|${angle}`. */
  cells: Record<string, PostCell>;
  byAngle: Record<string, PostCell>;
  byFormat: Record<string, PostCell>;
  byCategory: Record<string, PostCell>;
  overall: PostCell;
};

export const cellKey = (format: string, angle: string) => `${format}|${angle}`;

export function buildPostMatrix(posts: ClassifiedPost[]): PostMatrix {
  const formats = POST_FORMATS.filter((f) => posts.some((p) => p.format === f));
  const angles = ANGLES.filter((a) => posts.some((p) => p.angle === a));
  const cells: Record<string, PostCell> = {};
  for (const f of formats) for (const a of angles) cells[cellKey(f, a)] = summarizePosts(posts.filter((p) => p.format === f && p.angle === a));
  const byAngle: Record<string, PostCell> = {};
  for (const a of angles) byAngle[a] = summarizePosts(posts.filter((p) => p.angle === a));
  const byFormat: Record<string, PostCell> = {};
  for (const f of formats) byFormat[f] = summarizePosts(posts.filter((p) => p.format === f));
  const byCategory: Record<string, PostCell> = {};
  for (const c of CATEGORIES) {
    const list = posts.filter((p) => p.category === c);
    if (list.length > 0) byCategory[c] = summarizePosts(list);
  }
  return { formats, angles, cells, byAngle, byFormat, byCategory, overall: summarizePosts(posts) };
}

/* ------------------------------------------------------------------ anúncios */

export type AdMetrics = {
  id: string;
  spend: number;
  impressions: number;
  ctrLink: number;
  purchases: number;
  revenue: number;
};

export type ClassifiedAd = AdMetrics & { angle: Angle; category: Category };

export type AdCell = {
  n: number;
  spend: number;
  purchases: number;
  revenue: number;
  roas: number | null;
  cpa: number | null;
  /** CTR de link ponderado por impressões. */
  ctrLink: number | null;
  /** Menos de `MIN_PURCHASES_FOR_VERDICT` compras: o ROAS não é confiável. */
  lowData: boolean;
};

export const MIN_PURCHASES_FOR_VERDICT = 3;

export function summarizeAds(ads: AdMetrics[]): AdCell {
  const spend = ads.reduce((a, x) => a + x.spend, 0);
  const purchases = ads.reduce((a, x) => a + x.purchases, 0);
  const revenue = ads.reduce((a, x) => a + x.revenue, 0);
  const impressions = ads.reduce((a, x) => a + x.impressions, 0);
  const ctrWeighted = ads.reduce((a, x) => a + x.ctrLink * x.impressions, 0);
  return {
    n: ads.length,
    spend,
    purchases,
    revenue,
    roas: spend > 0 ? revenue / spend : null,
    cpa: purchases > 0 ? spend / purchases : null,
    ctrLink: impressions > 0 ? ctrWeighted / impressions : null,
    lowData: purchases < MIN_PURCHASES_FOR_VERDICT,
  };
}

export type AdMatrix = {
  angles: Angle[];
  byAngle: Record<string, AdCell>;
  byCategory: Record<string, AdCell>;
  overall: AdCell;
};

export function buildAdMatrix(ads: ClassifiedAd[]): AdMatrix {
  const angles = ANGLES.filter((a) => ads.some((x) => x.angle === a));
  const byAngle: Record<string, AdCell> = {};
  for (const a of angles) byAngle[a] = summarizeAds(ads.filter((x) => x.angle === a));
  const byCategory: Record<string, AdCell> = {};
  for (const c of CATEGORIES) {
    const list = ads.filter((x) => x.category === c);
    if (list.length > 0) byCategory[c] = summarizeAds(list);
  }
  return { angles, byAngle, byCategory, overall: summarizeAds(ads) };
}

/* ------------------------------------------------------- oportunidades (regras) */

export type MatrixInsight = {
  tone: "positivo" | "atencao" | "critico";
  title: string;
  text: string;
};

const pct = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")}%`;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Cruza o orgânico (Instagram) com o pago (anúncios) por ângulo. Só aponta o que os números
 * sustentam: amostra mínima de posts (2) e de compras (3).
 */
export function deriveInsights(postMatrix: PostMatrix, adMatrix: AdMatrix | null): MatrixInsight[] {
  const out: MatrixInsight[] = [];
  const overallRate = postMatrix.overall.engagementRate;

  if (overallRate !== null) {
    for (const angle of postMatrix.angles) {
      const cell = postMatrix.byAngle[angle];
      if (!cell || cell.n < 2 || cell.engagementRate === null) continue;
      const ratio = cell.engagementRate / overallRate;
      const hasAds = adMatrix ? (adMatrix.byAngle[angle]?.n ?? 0) > 0 : false;
      if (ratio >= 1.25) {
        out.push({
          tone: "positivo",
          title: `${ANGLE_LABEL[angle as Angle]} engaja acima da média`,
          text: `Engajamento de ${pct(cell.engagementRate)} nos ${cell.n} posts desse ângulo, contra ${pct(overallRate)} na média da conta.${adMatrix && !hasAds ? " Ainda não aparece em nenhum anúncio do período: vale testar." : ""}`,
        });
      } else if (ratio <= 0.7) {
        out.push({
          tone: "atencao",
          title: `${ANGLE_LABEL[angle as Angle]} engaja abaixo da média`,
          text: `Engajamento de ${pct(cell.engagementRate)} nos ${cell.n} posts desse ângulo, contra ${pct(overallRate)} na média da conta.`,
        });
      }
    }
  }

  if (adMatrix && adMatrix.overall.roas !== null) {
    const accountRoas = adMatrix.overall.roas;
    for (const angle of adMatrix.angles) {
      const cell = adMatrix.byAngle[angle];
      if (!cell || cell.roas === null) continue;
      if (cell.lowData) continue;
      const organic = postMatrix.byAngle[angle];
      if (cell.roas >= accountRoas * 1.2) {
        out.push({
          tone: "positivo",
          title: `${ANGLE_LABEL[angle as Angle]} converte bem em anúncio`,
          text: `ROAS de ${cell.roas.toFixed(1).replace(".", ",")}x em ${cell.n} anúncio(s) (${cell.purchases} compras), contra ${accountRoas.toFixed(1).replace(".", ",")}x na conta.${!organic || organic.n === 0 ? " Não há post orgânico com esse ângulo: dá para produzir conteúdo parecido." : ""}`,
        });
      } else if (cell.roas <= accountRoas * 0.6 && cell.spend > 0) {
        out.push({
          tone: "critico",
          title: `${ANGLE_LABEL[angle as Angle]} rende abaixo da conta em anúncio`,
          text: `ROAS de ${cell.roas.toFixed(1).replace(".", ",")}x com ${brl(cell.spend)} investidos, contra ${accountRoas.toFixed(1).replace(".", ",")}x na conta. Rever criativo ou reduzir verba.`,
        });
      }
    }
    for (const angle of adMatrix.angles) {
      const cell = adMatrix.byAngle[angle];
      if (cell && cell.purchases === 0 && cell.spend >= 50) {
        out.push({
          tone: "critico",
          title: `${ANGLE_LABEL[angle as Angle]}: verba sem nenhuma compra`,
          text: `${brl(cell.spend)} gastos em ${cell.n} anúncio(s) sem nenhuma compra registrada no período.`,
        });
      }
    }
  }

  return out;
}
