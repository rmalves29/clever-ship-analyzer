import { describe, expect, it } from "vitest";
import {
  buildAdMatrix,
  buildPostMatrix,
  cellKey,
  deriveInsights,
  formatOfPost,
  normalizeAngle,
  normalizeCategory,
  summarizeAds,
  summarizePosts,
  type ClassifiedAd,
  type ClassifiedPost,
} from "./creative-matrix-shared";

const post = (over: Partial<ClassifiedPost>): ClassifiedPost => ({
  id: "p",
  reach: 1000,
  views: 1500,
  totalInteractions: 50,
  saved: 5,
  shares: 5,
  format: "Reels",
  angle: "novidade",
  category: "brinco",
  mentionsPrice: false,
  ...over,
});

const ad = (over: Partial<ClassifiedAd>): ClassifiedAd => ({
  id: "a",
  spend: 100,
  impressions: 10_000,
  ctrLink: 0.02,
  purchases: 5,
  revenue: 500,
  angle: "novidade",
  category: "brinco",
  ...over,
});

describe("formatOfPost", () => {
  it("separa Reels, Carrossel, Vídeo e Foto", () => {
    expect(formatOfPost("REELS", "VIDEO")).toBe("Reels");
    expect(formatOfPost("FEED", "CAROUSEL_ALBUM")).toBe("Carrossel");
    expect(formatOfPost("FEED", "VIDEO")).toBe("Vídeo");
    expect(formatOfPost("FEED", "IMAGE")).toBe("Foto");
    expect(formatOfPost(undefined, undefined)).toBe("Foto");
  });
});

describe("normalização da classificação da IA", () => {
  it("aceita valores válidos e cai em 'outro'/'geral' para o resto", () => {
    expect(normalizeAngle(" Novidade ")).toBe("novidade");
    expect(normalizeAngle("inventado")).toBe("outro");
    expect(normalizeAngle(null)).toBe("outro");
    expect(normalizeCategory("COLAR")).toBe("colar");
    expect(normalizeCategory("anel de ouro")).toBe("geral");
  });
});

describe("summarizePosts", () => {
  it("calcula taxa como interações totais ÷ alcance total (não média de taxas)", () => {
    const cell = summarizePosts([
      post({ reach: 1000, totalInteractions: 100 }),
      post({ reach: 9000, totalInteractions: 100 }),
    ]);
    expect(cell.n).toBe(2);
    expect(cell.avgReach).toBe(5000);
    expect(cell.engagementRate).toBeCloseTo(0.02, 5);
  });

  it("devolve taxa nula quando não há alcance", () => {
    expect(summarizePosts([post({ reach: 0, totalInteractions: 0 })]).engagementRate).toBeNull();
    expect(summarizePosts([]).n).toBe(0);
  });
});

describe("buildPostMatrix", () => {
  it("monta células só para formatos e ângulos que existem", () => {
    const matrix = buildPostMatrix([
      post({ format: "Reels", angle: "novidade" }),
      post({ format: "Foto", angle: "promocao_cupom" }),
    ]);
    expect(matrix.formats).toEqual(["Reels", "Foto"]);
    expect(matrix.angles).toEqual(["novidade", "promocao_cupom"]);
    expect(matrix.cells[cellKey("Reels", "novidade")]?.n).toBe(1);
    expect(matrix.cells[cellKey("Reels", "promocao_cupom")]?.n).toBe(0);
    expect(matrix.overall.n).toBe(2);
  });
});

describe("summarizeAds / buildAdMatrix", () => {
  it("calcula ROAS, CPA e CTR ponderado por impressões", () => {
    const cell = summarizeAds([
      ad({ spend: 100, revenue: 400, purchases: 2, impressions: 1000, ctrLink: 0.1 }),
      ad({ spend: 100, revenue: 200, purchases: 2, impressions: 3000, ctrLink: 0.02 }),
    ]);
    expect(cell.roas).toBeCloseTo(3, 5);
    expect(cell.cpa).toBeCloseTo(50, 5);
    expect(cell.ctrLink).toBeCloseTo((0.1 * 1000 + 0.02 * 3000) / 4000, 5);
  });

  it("marca poucos dados quando há menos de 3 compras", () => {
    expect(summarizeAds([ad({ purchases: 2 })]).lowData).toBe(true);
    expect(summarizeAds([ad({ purchases: 3 })]).lowData).toBe(false);
  });

  it("agrupa por ângulo e por categoria", () => {
    const matrix = buildAdMatrix([ad({ angle: "novidade" }), ad({ angle: "prova_social", category: "colar" })]);
    expect(matrix.angles).toEqual(["novidade", "prova_social"]);
    expect(matrix.byCategory["colar"]?.n).toBe(1);
  });
});

describe("deriveInsights", () => {
  it("aponta ângulo orgânico forte que ainda não está em anúncio", () => {
    const posts = [
      post({ angle: "presente_ocasiao", totalInteractions: 200 }),
      post({ angle: "presente_ocasiao", totalInteractions: 200 }),
      post({ angle: "novidade", totalInteractions: 20 }),
      post({ angle: "novidade", totalInteractions: 20 }),
    ];
    const insights = deriveInsights(buildPostMatrix(posts), buildAdMatrix([ad({ angle: "novidade" })]));
    const forte = insights.find((i) => i.title.startsWith("Presente"));
    expect(forte?.tone).toBe("positivo");
    expect(forte?.text).toContain("vale testar");
  });

  it("ignora ângulos com amostra pequena", () => {
    const posts = [post({ angle: "novidade", totalInteractions: 500 }), post({ angle: "outro", totalInteractions: 1 })];
    const insights = deriveInsights(buildPostMatrix(posts), null);
    expect(insights).toEqual([]);
  });

  it("não dá veredito de ROAS com menos de 3 compras", () => {
    const posts = [post({}), post({})];
    const ads = [ad({ angle: "prova_social", purchases: 2, revenue: 1000, spend: 100 }), ad({ angle: "novidade", purchases: 5, revenue: 200, spend: 100 })];
    const insights = deriveInsights(buildPostMatrix(posts), buildAdMatrix(ads));
    expect(insights.some((i) => i.title.startsWith("Prova social"))).toBe(false);
  });

  it("alerta verba sem compra", () => {
    const ads = [ad({ angle: "urgencia_escassez", spend: 120, purchases: 0, revenue: 0 }), ad({ angle: "novidade" })];
    const insights = deriveInsights(buildPostMatrix([post({}), post({})]), buildAdMatrix(ads));
    expect(insights.some((i) => i.tone === "critico" && i.title.includes("sem nenhuma compra"))).toBe(true);
  });
});
