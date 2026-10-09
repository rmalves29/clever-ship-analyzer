import { describe, expect, it } from "vitest";
import { buildCreativeReportPdf, pdfSafeText, postCellText, reportFileName } from "./creative-report-pdf";
import { buildAdMatrix, buildPostMatrix, deriveInsights, type ClassifiedAd, type ClassifiedPost } from "./creative-matrix-shared";
import type { CreativeIdea, CreativeMatrixResult } from "./creative-matrix.server";

const mkPost = (i: number, o: Partial<ClassifiedPost> = {}) => ({
  id: String(i), reach: 2000 + i * 300, views: 3000, totalInteractions: 80 + i * 10, saved: 4, shares: 3,
  format: "Reels" as const, angle: "novidade" as const, category: "brinco" as const, mentionsPrice: false,
  caption: `Legenda ${i}`, permalink: null, thumbnailUrl: null, timestamp: "2026-10-01", likes: 5, comments: 1, ...o,
});
const posts = [mkPost(1), mkPost(2, { format: "Carrossel", angle: "presente_ocasiao" }), mkPost(3, { format: "Carrossel", angle: "presente_ocasiao" })];
const ads = [
  { id: "a", name: "Anúncio", spend: 200, impressions: 20000, ctrLink: 0.02, purchases: 6, revenue: 900, roas: 4.5, angle: "novidade" as const, category: "brinco" as const, thumbnailUrl: null },
] satisfies (ClassifiedAd & { name: string; thumbnailUrl: string | null; roas: number })[];
const postMatrix = buildPostMatrix(posts);
const adMatrix = buildAdMatrix(ads);
const result: CreativeMatrixResult = {
  datePreset: "last_30d", generatedAt: "2026-10-09T18:00:00.000Z", posts, ads, postMatrix, adMatrix, notices: [],
  insights: deriveInsights(postMatrix, adMatrix), resumo: "Resumo com acentuação: ação, coração.", recomendacoes: ["Fazer mais carrosséis de presente."],
};
const idea: CreativeIdea = {
  tipo: "post", formato: "Carrossel", angulo: "presente_ocasiao", produto: "Kit", gancho: "Presente 🎁 perfeito",
  roteiro: ["Capa", "Detalhe"], legenda: "Texto “bonito” — com [informe a oferta]", cta: "Toque no link", baseado_em: "12,8% de engajamento", prioridade: "alta",
};

describe("pdfSafeText", () => {
  it("mantém acentos do português e troca símbolos fora do Latin-1", () => {
    expect(pdfSafeText("Ação de coração — “novo” → hoje…")).toBe('Ação de coração - "novo" -> hoje...');
  });
  it("remove emojis", () => {
    expect(pdfSafeText("Presente 🎁 perfeito ✨")).toBe("Presente perfeito");
  });
});

describe("postCellText / reportFileName", () => {
  it("formata célula vazia e preenchida", () => {
    expect(postCellText(undefined)).toBe("-");
    expect(postCellText({ n: 2, avgReach: 3050, engagementRate: 0.128, avgSavesShares: 5 })).toContain("12,8%");
  });
  it("nomeia o arquivo com a data", () => {
    expect(reportFileName(new Date(2026, 9, 9))).toBe("matriz-criativa-2026-10-09.pdf");
  });
});

describe("buildCreativeReportPdf", () => {
  it("gera um PDF válido sem ideias", async () => {
    const doc = await buildCreativeReportPdf(result, null);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    const bytes = new Uint8Array(doc.output("arraybuffer"));
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("acrescenta páginas quando há ideias", async () => {
    const without = await buildCreativeReportPdf(result, null);
    const withIdeas = await buildCreativeReportPdf(result, [idea, { ...idea, tipo: "anuncio", formato: "Imagem" }]);
    expect(withIdeas.getNumberOfPages()).toBeGreaterThan(without.getNumberOfPages());
  });
});
