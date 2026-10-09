import { describe, expect, it } from "vitest";
import { buildReportHtml, esc, fmt, reportFileName } from "./matriz-agente-report";
import { briefSchema, briefingSchema, planSchema, selectProduction, type CreativeBriefing, type MatrixCell, type MatrixProject } from "./matriz-agente-shared";

const brief = briefSchema.parse({ marca: "Mania de Mulher", produto: "Kit Londres <b>", urlDestino: "https://x.com/p", condicaoComercial: "[VALIDAR CONDIÇÃO COMERCIAL]" });
const cell = (id: string, motivoId: string, pilar: MatrixCell["pilar"], n: number): MatrixCell => ({
  id, motivoId, pilar, sementes: ["a", "b", `<img src=x onerror=alert(1)>`], consciencia: "consciente_problema",
  scores: { evidencia: n, relevancia: n, viabilidade: n, prova: n, assets: n, novidade: n, continuidade: n, fase: n },
  statusSugerido: "testar", papelPossivel: "expansao", observacao: "", vozPendente: false,
});
const celulas = [
  cell("M1-angulo", "M1", "angulo", 5), cell("M1-conceito", "M1", "conceito", 4), cell("M2-dsb", "M2", "dsb", 4),
  cell("M2-angulo", "M2", "angulo", 3), cell("M3-full_funnel", "M3", "full_funnel", 3), cell("M3-voz_cliente", "M3", "voz_cliente", 2),
  cell("M4-angulo", "M4", "angulo", 2), cell("M4-conceito", "M4", "conceito", 2),
];
const sel = selectProduction(celulas, 8);
const body = briefingSchema.parse({ nome: "Teste", headline: "Pague menos por cada peça <script>alert(1)</script>", cta: "Montar meu kit", pilar: "angulo", imagemAncora: "Kit sobre bancada", provaFonte: "Página oficial", copyPrincipal: "Texto", titulo: "Título", descricao: "Desc", urlDestino: "https://x.com/p" });
const briefings: CreativeBriefing[] = sel.map((s, i) => ({ ...body, id: `C${i + 1}`, cellId: s.cell.id, papel: s.papel, avisos: [] }));
const plano = planSchema.parse({ resumoExecutivo: "Resumo", testes: [{ id: "T1", estagio: "exploracao" }], riscos: [{ risco: "r", severidade: "alta", mitigacao: "m" }], healthScore: [{ criterio: "Fidelidade e prova", nota: 6, justificativa: "j" }], proximosPassos: ["Passo 1"] });

const project: MatrixProject = {
  input: { url: "https://x.com", objetivo: "Vendas", fase: "pico", oferta: "", publico: "", materiais: "", cpaMax: null, roasEquilibrio: null, modelo: "gpt-4o" },
  generatedAt: "2026-10-09T12:00:00.000Z", paginas: [{ tipo: "home", url: "https://x.com/", titulo: "Home", ok: true }], imagemProduto: null, brief,
  motivos: [{ id: "M1", nome: "Motivo 1", tipo: "funcional", descricao: "d", evidencia: "e", consciencia: "consciente_problema", fase: "pico", risco: "r" }],
  celulas, selecionadas: sel.map((s) => ({ cellId: s.cell.id, papel: s.papel })), briefings, plano,
};

describe("escape", () => {
  it("escapa HTML e destaca placeholders", () => {
    expect(esc(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
    expect(fmt("Use [VALIDAR CONDIÇÃO COMERCIAL] aqui")).toContain("<mark>[VALIDAR CONDIÇÃO COMERCIAL]</mark>");
  });
});

describe("buildReportHtml", () => {
  const html = buildReportHtml(project);

  it("é autocontido: sem links, scripts ou imagens externas", () => {
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/src="https?:/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/\bhref="https?:/i);
  });

  it("não deixa o conteúdo da IA virar HTML ativo", () => {
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Kit Londres &lt;b&gt;");
  });

  it("tem as 15 seções numeradas e a capa", () => {
    for (const id of ["resumo", "brief", "fontes", "dores", "consciencia", "matriz", "ranking", "galeria", "briefings", "copies", "placements", "testes", "riscos", "health", "passos"]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain("Matriz Criativa de Black Friday");
  });

  it("gera um mockup 4:5 por criativo, com Headline / Imagem / CTA", () => {
    expect((html.match(/class="mock"/g) ?? []).length).toBe(briefings.length);
    expect(html).toContain("[INSERIR FOTO DO PRODUTO]");
    expect(html).toContain("<b>Headline</b>");
  });

  it("embute a foto do produto quando existe", () => {
    const withImg = buildReportHtml({ ...project, imagemProduto: "data:image/png;base64,AAAA" });
    expect(withImg).toContain('<img src="data:image/png;base64,AAAA"');
  });

  it("marca CPA e ROAS como pendentes quando não informados", () => {
    expect(html).toContain("[CONFIRMAR NÚMERO]");
  });

  it("nomeia o arquivo com produto e data", () => {
    expect(reportFileName(project)).toBe("matriz-criativa-black-friday-kit-londres-b-2026-10-09.html");
  });
});
