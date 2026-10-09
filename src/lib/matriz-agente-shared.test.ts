import { describe, expect, it } from "vitest";
import {
  assertPublicHttpUrl,
  briefSchema,
  cellResponseSchema,
  clampScore,
  extractPageFacts,
  healthAverage,
  healthVerdict,
  looksLikeProductUrl,
  selectProduction,
  totalScore,
  validateBriefing,
  wordCount,
  type MatrixCell,
  type Scores,
} from "./matriz-agente-shared";

const scores = (n: number): Scores => ({ evidencia: n, relevancia: n, viabilidade: n, prova: n, assets: n, novidade: n, continuidade: n, fase: n });

const cell = (id: string, motivoId: string, pilar: MatrixCell["pilar"], n: number, over: Partial<MatrixCell> = {}): MatrixCell => ({
  id, motivoId, pilar, sementes: ["a", "b", "c"], consciencia: "consciente_problema", scores: scores(n),
  statusSugerido: "testar", papelPossivel: "expansao", observacao: "", vozPendente: false, ...over,
});

describe("assertPublicHttpUrl", () => {
  it("aceita lojas públicas e completa o protocolo", () => {
    expect(assertPublicHttpUrl("https://maniadmulher.com/products/x").hostname).toBe("maniadmulher.com");
    expect(assertPublicHttpUrl("maniadmulher.com").protocol).toBe("https:");
  });

  it.each([
    "http://localhost:3000",
    "http://127.0.0.1/admin",
    "http://10.0.0.5",
    "http://192.168.1.10",
    "http://172.20.0.1",
    "http://169.254.169.254/latest/meta-data",
    "http://100.64.0.1",
    "http://[::1]/",
    "http://[fd00::1]/",
    "http://servidor.internal",
    "ftp://exemplo.com",
    "https://user:senha@exemplo.com",
    "https://exemplo.com:8443",
    "http://intranet",
  ])("bloqueia %s", (raw) => {
    expect(() => assertPublicHttpUrl(raw)).toThrow();
  });
});

describe("selectProduction", () => {
  const cells = [
    cell("M1-angulo", "M1", "angulo", 36),
    cell("M1-conceito", "M1", "conceito", 34),
    cell("M2-dsb", "M2", "dsb", 33),
    cell("M3-full_funnel", "M3", "full_funnel", 32),
    cell("M3-voz_cliente", "M3", "voz_cliente", 31, { papelPossivel: "objecao" }),
    cell("M4-angulo", "M4", "angulo", 30),
    cell("M4-conceito", "M4", "conceito", 29),
    cell("M2-angulo", "M2", "angulo", 28),
    cell("M5-dsb", "M5", "dsb", 27),
    cell("MX-bloq", "M5", "conceito", 40, { statusSugerido: "bloqueado" }),
    cell("MX-pend", "M5", "voz_cliente", 39, { statusSugerido: "pendente" }),
  ];

  it("devolve 8 criativos únicos com 3 âncoras, expansões e 1 objeção", () => {
    const sel = selectProduction(cells, 8);
    expect(sel).toHaveLength(8);
    expect(new Set(sel.map((s) => s.cell.id)).size).toBe(8);
    expect(sel.filter((s) => s.papel === "ancora")).toHaveLength(3);
    expect(sel.filter((s) => s.papel === "objecao")).toHaveLength(1);
  });

  it("nunca escolhe célula bloqueada nem pendente quando há alternativas", () => {
    const ids = selectProduction(cells, 8).map((s) => s.cell.id);
    expect(ids).not.toContain("MX-bloq");
    expect(ids).not.toContain("MX-pend");
  });

  it("diversifica motivos entre as âncoras", () => {
    const anchors = selectProduction(cells, 8).filter((s) => s.papel === "ancora");
    expect(new Set(anchors.map((a) => a.cell.motivoId)).size).toBe(3);
  });

  it("usa a célula marcada como objeção para o papel de objeção", () => {
    const objection = selectProduction(cells, 8).find((s) => s.papel === "objecao");
    expect(objection?.cell.id).toBe("M3-voz_cliente");
  });

  it("completa com pendentes só se faltarem candidatas", () => {
    const few = [cell("A", "M1", "angulo", 30), cell("B", "M2", "dsb", 20), cell("P", "M3", "conceito", 10, { statusSugerido: "pendente" })];
    const ids = selectProduction(few, 8).map((s) => s.cell.id);
    expect(ids).toEqual(expect.arrayContaining(["A", "B", "P"]));
  });

  it("aceita menos células que o pedido", () => {
    expect(selectProduction([cell("A", "M1", "angulo", 30)], 8)).toHaveLength(1);
    expect(selectProduction([], 8)).toEqual([]);
  });
});

describe("pontuação", () => {
  it("limita notas a 0–5 e soma as 8", () => {
    expect(clampScore(9)).toBe(5);
    expect(clampScore(-2)).toBe(0);
    expect(clampScore(Number.NaN)).toBe(0);
    expect(totalScore(scores(4))).toBe(32);
  });

  it("veredito do health score segue as faixas do método", () => {
    expect(healthVerdict(2.9).tone).toBe("critico");
    expect(healthVerdict(5).tone).toBe("atencao");
    expect(healthVerdict(7.5).tone).toBe("pronto");
    expect(healthVerdict(9.2).tone).toBe("maduro");
    expect(healthAverage([{ nota: 8 }, { nota: 6 }])).toBe(7);
    expect(healthAverage([])).toBe(0);
  });
});

describe("validateBriefing", () => {
  const ok = { headline: "Pague menos por cada peça", cta: "Montar meu kit", copyPrincipal: "Texto", provaFonte: "Página oficial" };

  it("aceita headline de 4–9 palavras e CTA de 2–4", () => {
    expect(validateBriefing(ok, true)).toEqual([]);
  });

  it("avisa tamanho fora da regra", () => {
    const avisos = validateBriefing({ ...ok, headline: "Curto demais", cta: "Compre agora mesmo e aproveite tudo" }, true);
    expect(avisos.some((a) => a.startsWith("Headline"))).toBe(true);
    expect(avisos.some((a) => a.startsWith("CTA"))).toBe(true);
  });

  it("avisa número sem condição confirmada, salvo com placeholder", () => {
    expect(validateBriefing({ ...ok, headline: "Leve tudo com 30% de desconto" }, false).some((a) => a.includes("condição comercial"))).toBe(true);
    expect(validateBriefing({ ...ok, headline: "Leve tudo com [VALIDAR CONDIÇÃO COMERCIAL]" }, false).some((a) => a.includes("condição comercial"))).toBe(false);
  });

  it("conta palavras", () => {
    expect(wordCount("  uma   frase  de teste ")).toBe(4);
  });
});

describe("extractPageFacts", () => {
  const html = `<html><head><title>Brinco Luna &amp; cia</title>
    <meta property="og:description" content="Brinco banhado a ouro">
    <meta property="og:image" content="/img/luna.jpg">
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Brinco Luna","brand":{"name":"Mania de Mulher"},
      "offers":{"@type":"Offer","price":"89.90","priceCurrency":"BRL","availability":"https://schema.org/InStock"},
      "aggregateRating":{"ratingValue":"4.8","reviewCount":"32"},"review":[{"reviewBody":"Lindo demais"}]}</script>
    <script>var x = "não deve aparecer";</script></head>
    <body><h1>Brinco Luna</h1><p>Peça leve e delicada.</p>
    <a href="/products/colar-mia">Colar</a><a href="/collections/brincos">Brincos</a><a href="https://outro.com/products/x">Fora</a></body></html>`;

  const facts = extractPageFacts(html, "https://maniadmulher.com/products/brinco-luna");

  it("lê título, descrição, imagem e H1", () => {
    expect(facts.titulo).toBe("Brinco Luna & cia");
    expect(facts.descricao).toBe("Brinco banhado a ouro");
    expect(facts.imagem).toBe("https://maniadmulher.com/img/luna.jpg");
    expect(facts.h1).toEqual(["Brinco Luna"]);
  });

  it("lê preço, nota e avaliação reais do JSON-LD", () => {
    expect(facts.produto?.preco).toBe("89.90");
    expect(facts.produto?.marca).toBe("Mania de Mulher");
    expect(facts.produto?.nota).toBe("4.8");
    expect(facts.produto?.avaliacoes).toEqual(["Lindo demais"]);
  });

  it("ignora scripts no texto e separa links de produto e categoria do mesmo domínio", () => {
    expect(facts.texto).not.toContain("não deve aparecer");
    expect(facts.texto).toContain("Peça leve e delicada.");
    expect(facts.linksProduto).toEqual(["https://maniadmulher.com/products/colar-mia"]);
    expect(facts.linksCategoria).toEqual(["https://maniadmulher.com/collections/brincos"]);
  });

  it("devolve produto nulo sem JSON-LD", () => {
    expect(extractPageFacts("<html><title>Home</title></html>", "https://x.com").produto).toBeNull();
  });

  it("reconhece URL de produto", () => {
    expect(looksLikeProductUrl("https://x.com/products/brinco-luna")).toBe(true);
    expect(looksLikeProductUrl("https://x.com/")).toBe(false);
  });
});

describe("esquemas tolerantes à saída da IA", () => {
  it("brief aceita campos faltando e enum inválido", () => {
    const parsed = briefSchema.parse({ produto: "Kit", faseBlack: "inventada", claims: [{ texto: "x", status: "???" }], perguntas: ["1", "2", "3", "4"] });
    expect(parsed.faseBlack).toBe("pico");
    expect(parsed.claims[0]?.status).toBe("hipotese");
    expect(parsed.perguntas).toHaveLength(3);
    expect(parsed.marca).toBe("");
  });

  it("células limitam as notas e preenchem padrões", () => {
    const parsed = cellResponseSchema.parse({ celulas: [{ pilar: "angulo", sementes: ["a"], scores: { evidencia: 9, relevancia: "3" } }] });
    expect(parsed.celulas[0]?.scores.evidencia).toBe(5);
    expect(parsed.celulas[0]?.scores.relevancia).toBe(3);
    expect(parsed.celulas[0]?.scores.assets).toBe(0);
    expect(parsed.celulas[0]?.statusSugerido).toBe("testar");
  });
});

import { detectInstallmentDivergence } from "./matriz-agente-shared";

describe("detectInstallmentDivergence", () => {
  it("aponta parcelamento diferente entre faixa do topo e página do produto", () => {
    const out = detectInstallmentDivergence([
      { rotulo: "home", texto: "Troca fácil\nParcele em 3x sem juros\nMais vendidos" },
      { rotulo: "produto", texto: "R$ 219,99\nou 12x de R$ 18,33" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("3x");
    expect(out[0]).toContain("12x");
  });

  it("não acusa divergência quando só há um valor", () => {
    expect(detectInstallmentDivergence([{ rotulo: "home", texto: "Parcele em 3x sem juros" }, { rotulo: "produto", texto: "3x de R$ 70,00" }])).toEqual([]);
    expect(detectInstallmentDivergence([{ rotulo: "home", texto: "Sem parcelamento citado" }])).toEqual([]);
  });
});

import { buildLearningsText } from "./matriz-agente-shared";

describe("buildLearningsText", () => {
  const post = (caption: string, rate: number) => ({ caption, format: "Reels", angle: "novidade", reach: 1000, totalInteractions: rate * 1000 });

  it("resume achados, melhores e piores posts e só anúncios com compras suficientes", () => {
    const text = buildLearningsText({
      resumo: "Resumo",
      recomendacoes: ["Mais carrossel"],
      insights: [{ tone: "positivo", title: "Presente engaja", text: "12,8%" }],
      posts: [post("A", 0.1), post("B", 0.05), post("C", 0.03), post("D", 0.001), post("E", 0.002)],
      ads: [
        { name: "Bom", angle: "novidade", spend: 100, purchases: 5, roas: 4 },
        { name: "Poucos dados", angle: "outro", spend: 100, purchases: 1, roas: 9 },
      ],
    });
    expect(text).toContain("Presente engaja");
    expect(text).toContain("Posts que mais engajaram");
    expect(text).toContain('"Bom"');
    expect(text).not.toContain("Poucos dados");
    expect(text).toContain("Recomendação anterior: Mais carrossel");
  });

  it("omite listas de posts quando há amostra pequena", () => {
    const text = buildLearningsText({ resumo: "", recomendacoes: [], insights: [], posts: [post("A", 0.1)], ads: [] });
    expect(text).not.toContain("Posts que mais engajaram");
  });
});

describe("validateBriefing: parcelamento em divergência", () => {
  const base = { headline: "Compre em 12x sem juros hoje", cta: "Montar meu kit", copyPrincipal: "Texto", provaFonte: "Página" };
  it("avisa quando a peça cita parcelamento que diverge entre páginas", () => {
    expect(validateBriefing(base, true, true).some((a) => a.includes("divergência"))).toBe(true);
  });
  it("não avisa sem divergência ou com placeholder", () => {
    expect(validateBriefing(base, true, false).some((a) => a.includes("divergência"))).toBe(false);
    expect(validateBriefing({ ...base, headline: "Parcele em [VALIDAR CONDIÇÃO COMERCIAL] x" }, true, true).some((a) => a.includes("divergência"))).toBe(false);
  });
});

import { findDuplicateHeadlines, headlinesSimilar } from "./matriz-agente-shared";

describe("headlines repetidas", () => {
  it("detecta a mesma tese com palavras parecidas", () => {
    expect(headlinesSimilar("Transforme seu Look com Elegância Atemporal", "Destaque-se com Elegância Atemporal")).toBe(true);
    expect(headlinesSimilar("Transforme seu Look com Elegância Atemporal", "Transforme Seu Look com Peças Exclusivas")).toBe(true);
    expect(headlinesSimilar("Conforto estiloso para peles sensíveis", "Versatilidade para eventos e dia a dia")).toBe(false);
  });

  it("mantém a primeira ocorrência e marca as repetições", () => {
    const list = ["Elegância atemporal em cada detalhe", "Versatilidade para eventos e dia a dia", "Destaque-se com elegância atemporal", "Conforto para peles sensíveis"];
    expect(findDuplicateHeadlines(list)).toEqual([2]);
    expect(findDuplicateHeadlines([])).toEqual([]);
  });
});
