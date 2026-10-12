import { describe, expect, it } from "vitest";
import {
  EMPTY_MEMORY,
  anonymizeText,
  computeSurveyDataset,
  describeSurvey,
  intelligenceForDashboard,
  isoWeek,
  type RawResponse,
  type RawSurvey,
} from "./survey-analysis-shared";
import { buildAnalysisUserPrompt } from "./survey-analysis-prompt";

const survey: RawSurvey = {
  id: "s1",
  slug: "pos-entrega",
  title: "Pós-entrega",
  description: null,
  questions: [
    { id: "nota", type: "nota", label: "Como foi receber?", required: true },
    { id: "prob", type: "escolha_unica", label: "Se tiver problema: o que aconteceu?", required: false, options: ["Atrasou", "Defeito", "Faltou item"] },
    { id: "livre", type: "texto_longo", label: "Conta pra gente", required: false },
    { id: "msg", type: "mensagem", label: "Já passei para a equipe", required: false },
  ],
};

function responses(): RawResponse[] {
  const rows: RawResponse[] = [];
  // 40 respostas: 30 nota 5, 6 nota 2, 4 nota 4; as 6 de nota 2 têm problema
  for (let i = 0; i < 30; i++) rows.push({ answers: { nota: "5" }, source: "whatsapp", created_at: "2026-10-05T12:00:00Z" });
  for (let i = 0; i < 6; i++) rows.push({ answers: { nota: "2", prob: i < 4 ? "Atrasou" : "Defeito", livre: i === 0 ? "Chegou tarde, falei com maria@x.com ou 31 99290-4210" : "" }, source: "email", created_at: "2026-10-12T12:00:00Z" });
  for (let i = 0; i < 4; i++) rows.push({ answers: { nota: "4", __tags: ["promotora"] }, source: "whatsapp", created_at: "2026-10-12T12:00:00Z" });
  return rows;
}

describe("tabulação das pesquisas", () => {
  const d = computeSurveyDataset(survey, responses());

  it("conta respostas, origem e semanas", () => {
    expect(d.responses).toBe(40);
    expect(d.origins).toEqual([{ source: "whatsapp", n: 34 }, { source: "email", n: 6 }]);
    expect(d.perWeek.map((w) => w.n)).toEqual([30, 10]);
    expect(d.tags).toEqual([{ tag: "promotora", n: 4 }]);
  });

  it("n e % por opção, na base de quem respondeu (condicional) e marca amostra pequena", () => {
    const nota = d.questions.find((q) => q.id === "nota")!;
    expect(nota.base).toBe(40);
    expect(nota.options![0]).toEqual({ label: "5", n: 30, pct: 75 });
    expect(nota.average).toBe(4.45);
    expect(nota.smallSample).toBe(false);
    const prob = d.questions.find((q) => q.id === "prob")!;
    expect(prob.conditional).toBe(true);
    expect(prob.base).toBe(6); // só quem respondeu
    expect(prob.smallSample).toBe(true);
    expect(prob.options![0]).toEqual({ label: "Atrasou", n: 4, pct: 66.7 });
    // pergunta do tipo "mensagem" não é pergunta
    expect(d.questions.some((q) => q.id === "msg")).toBe(false);
  });

  it("texto livre sai sem e-mail nem telefone", () => {
    const livre = d.questions.find((q) => q.id === "livre")!;
    expect(livre.textsTotal).toBe(1);
    expect(livre.texts![0]).toContain("[e-mail]");
    expect(livre.texts![0]).toContain("[telefone]");
    expect(livre.texts![0]).not.toMatch(/maria@|99290/);
  });

  it("cruza nota × origem quando há mais de uma origem e respondentes suficientes", () => {
    const x = d.crosstabs.find((c) => c.a === "Como foi receber?" && c.b === "Origem");
    expect(x).toBeTruthy();
    expect(x!.n).toBe(40);
    const row5 = x!.counts[x!.rows.indexOf("5")]!;
    expect(row5[x!.cols.indexOf("whatsapp")]).toBe(30);
  });
});

describe("apoio", () => {
  it("anonimiza", () => {
    expect(anonymizeText("me chama em @maria_x ou 11987654321, cpf 123.456.789-09 https://a.com/x")).toBe("me chama em [usuário] ou [telefone], cpf [documento] [link]");
    expect(anonymizeText("a".repeat(500)).length).toBe(280);
  });

  it("semana ISO", () => {
    expect(isoWeek("2026-10-05T12:00:00Z")).toBe("2026-W41");
    expect(isoWeek("lixo")).toBe("?");
  });

  it("pesquisa conhecida usa o mapa; pesquisa nova entra com aviso", () => {
    expect(describeSurvey({ slug: "pos-compra", title: "x", description: null })).toMatchObject({ code: "P1 Pós-compra", known: true });
    const nova = describeSurvey({ slug: "minha-nova", title: "Cores favoritas", description: "Quais cores vendem?" });
    expect(nova).toMatchObject({ code: "Cores favoritas", known: false, keyQuestion: "Quais cores vendem?" });
  });

  it("o prompt lista toda pesquisa, marca as novas e leva a memória", () => {
    const base = computeSurveyDataset(survey, responses());
    const nova = computeSurveyDataset({ ...survey, id: "s2", slug: "minha-nova", title: "Cores favoritas" }, responses());
    const prompt = buildAnalysisUserPrompt({
      kind: "B",
      datasets: [base, nova],
      context: { pedidos: 120, ticketMedio: 150.5, recompra: 4.2, recebidos: { "pos-entrega": 200 } },
      memory: { aprendizados: [{ tema: "Frete", achado: "Frete pesa", evidencia: "P4 38%", pesquisas: ["P4"], tendencia: "novo", desde: "2026-10-01", ultimaVez: "2026-10-01" }], resumoDashboard: [], alertas: [] },
      newSlugs: new Set(["minha-nova"]),
    });
    expect(prompt).toContain("P2 Pós-entrega (link: pos-entrega)");
    expect(prompt).toContain("Cores favoritas (link: minha-nova)");
    expect(prompt).toContain("PESQUISA NOVA desde a última análise");
    expect(prompt).toContain("INTELIGÊNCIA ACUMULADA");
    expect(prompt).toContain("Pedidos no período: 120 · Ticket médio: R$ 150.50 · Taxa de recompra: 4.20%");
    expect(prompt).toContain("P2 Pós-entrega 200");
    expect(prompt).toContain("MODO B");
  });

  it("inteligência do dashboard só existe quando há conteúdo", () => {
    expect(intelligenceForDashboard(EMPTY_MEMORY, null)).toBe("");
    const text = intelligenceForDashboard({ aprendizados: [], resumoDashboard: ["Frete é a maior barreira (38%)"], alertas: ["3 casos de banho escurecendo"] }, { generatedAt: "2026-10-12T12:00:00Z", surveys: 6, responses: 400 });
    expect(text).toContain("ALERTA: 3 casos de banho escurecendo");
    expect(text).toContain("- Frete é a maior barreira (38%)");
    expect(text).toContain("6 pesquisas, 400 respostas");
  });
});
