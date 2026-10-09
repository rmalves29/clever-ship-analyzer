/**
 * Agente Arquiteto da Matriz Criativa — tipos, esquemas e regras puras (sem rede, sem banco).
 * Compartilhado entre servidor, tela e testes. Método: Growth Commerce AI, Bloco 07.
 *
 * A IA gera hipóteses e briefings; TUDO que decide ordem, seleção, validação de tamanho de texto e
 * veredito é calculado aqui, em código.
 */
import { z } from "zod";

/* ------------------------------------------------------------------ vocabulário */

export const PILLARS = ["angulo", "conceito", "dsb", "full_funnel", "voz_cliente"] as const;
export type Pillar = (typeof PILLARS)[number];
export const PILLAR_LABEL: Record<Pillar, string> = {
  angulo: "Ângulo",
  conceito: "Conceito",
  dsb: "DSB",
  full_funnel: "Full Funnel",
  voz_cliente: "Voz do Cliente",
};

export const AWARENESS = ["inconsciente", "consciente_problema", "consciente_solucao", "consciente_produto", "muito_consciente"] as const;
export type Awareness = (typeof AWARENESS)[number];
export const AWARENESS_LABEL: Record<Awareness, string> = {
  inconsciente: "Inconsciente",
  consciente_problema: "Consciente do problema",
  consciente_solucao: "Consciente da solução",
  consciente_produto: "Consciente do produto",
  muito_consciente: "Muito consciente",
};

export const PHASES = ["aquecimento", "pre_black", "pico", "recuperacao", "pos_black"] as const;
export type Phase = (typeof PHASES)[number];
export const PHASE_LABEL: Record<Phase, string> = {
  aquecimento: "Aquecimento",
  pre_black: "Pré-Black (captura de intenção)",
  pico: "Pico da Black Friday",
  recuperacao: "Recuperação",
  pos_black: "Pós-Black",
};

export const CLAIM_STATUS = ["comprovada", "publicada", "hipotese", "sem_fonte", "sensivel"] as const;
export type ClaimStatus = (typeof CLAIM_STATUS)[number];
export const CLAIM_LABEL: Record<ClaimStatus, string> = {
  comprovada: "Comprovada",
  publicada: "Publicada",
  hipotese: "Hipótese",
  sem_fonte: "Sem fonte (proibida)",
  sensivel: "Sensível (validar)",
};

export const CELL_STATUS = ["ancora", "rodando", "testar", "pendente", "bloqueado"] as const;
export type CellStatus = (typeof CELL_STATUS)[number];
export const CELL_STATUS_LABEL: Record<CellStatus, string> = {
  ancora: "Âncora",
  rodando: "Rodando",
  testar: "Testar",
  pendente: "Pendente",
  bloqueado: "Bloqueado",
};

export const ROLES = ["ancora", "expansao", "objecao"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = { ancora: "Âncora", expansao: "Expansão", objecao: "Objeção" };

export const MOTIVE_TYPES = ["funcional", "emocional", "social", "situacional"] as const;
export type MotiveType = (typeof MOTIVE_TYPES)[number];

export const SCORE_KEYS = ["evidencia", "relevancia", "viabilidade", "prova", "assets", "novidade", "continuidade", "fase"] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];
export const SCORE_LABEL: Record<ScoreKey, string> = {
  evidencia: "Evidência",
  relevancia: "Relevância",
  viabilidade: "Viabilidade econômica",
  prova: "Capacidade de prova",
  assets: "Assets disponíveis",
  novidade: "Novidade estratégica",
  continuidade: "Continuidade com a página",
  fase: "Adequação à fase",
};
export type Scores = Record<ScoreKey, number>;

export const FORMATS = ["estatico", "carrossel_sequencial", "carrossel_modular", "video_ugc", "remarketing"] as const;
export type CreativeFormat = (typeof FORMATS)[number];
export const FORMAT_LABEL: Record<CreativeFormat, string> = {
  estatico: "Estático 4:5",
  carrossel_sequencial: "Carrossel sequencial",
  carrossel_modular: "Carrossel modular",
  video_ugc: "Vídeo / UGC",
  remarketing: "Remarketing",
};

export const PLACEMENTS = ["4:5", "1:1", "9:16"] as const;

export const HEALTH_CRITERIA = [
  "Fidelidade e prova",
  "Cobertura de motivos de compra",
  "Diversidade de hipóteses",
  "Headline e argumento visual",
  "Adequação a placement",
  "Continuidade com a página",
  "Qualidade dos briefings",
  "Plano de teste",
  "Coerência econômica",
  "Capacidade operacional",
] as const;

/* ------------------------------------------------------- esquemas (saída da IA) */

const text = z.string().catch("");
const textList = z.array(z.string()).catch([]);
const enumOr = <T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) => z.enum(values).catch(fallback);
const score = z.coerce.number().catch(0).transform((n) => clampScore(n));

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(5, Math.round(value)));
}

export const briefSchema = z.object({
  marca: text,
  produto: text,
  urlDestino: text,
  preco: text,
  condicaoComercial: text,
  publico: text,
  beneficioCentral: text,
  objetivo: text,
  faseBlack: enumOr(PHASES, "pico"),
  evidencias: textList,
  assets: textList,
  restricoes: textList,
  aprendizadosAnteriores: textList,
  fontes: z
    .array(z.object({ tipo: text, origem: text, resumo: text }))
    .catch([]),
  claims: z
    .array(z.object({ texto: text, status: enumOr(CLAIM_STATUS, "hipotese"), origem: text }))
    .catch([]),
  divergencias: textList,
  pendencias: textList,
  perguntas: textList.transform((l) => l.slice(0, 3)),
  /** Preenchido em código com avaliações publicadas na página (JSON-LD); nunca pela IA. */
  avaliacoesReais: textList,
});
export type ProductBrief = z.infer<typeof briefSchema>;

export const motiveSchema = z.object({
  id: text,
  nome: text,
  tipo: enumOr(MOTIVE_TYPES, "funcional"),
  descricao: text,
  evidencia: text,
  consciencia: enumOr(AWARENESS, "consciente_problema"),
  fase: enumOr(PHASES, "pico"),
  risco: text,
});
export type BuyingMotive = z.infer<typeof motiveSchema>;
export const motivesResponseSchema = z.object({ motivos: z.array(motiveSchema).catch([]) });

export const scoresSchema = z.object({
  evidencia: score,
  relevancia: score,
  viabilidade: score,
  prova: score,
  assets: score,
  novidade: score,
  continuidade: score,
  fase: score,
});

export const cellResponseSchema = z.object({
  celulas: z
    .array(
      z.object({
        pilar: z.string().catch(""),
        sementes: textList,
        consciencia: enumOr(AWARENESS, "consciente_problema"),
        scores: scoresSchema.catch({ evidencia: 0, relevancia: 0, viabilidade: 0, prova: 0, assets: 0, novidade: 0, continuidade: 0, fase: 0 }),
        statusSugerido: enumOr(CELL_STATUS, "testar"),
        papelPossivel: enumOr(ROLES, "expansao"),
        observacao: text,
        vozPendente: z.boolean().catch(false),
      }),
    )
    .catch([]),
});

export type MatrixCell = {
  id: string;
  motivoId: string;
  pilar: Pillar;
  sementes: string[];
  consciencia: Awareness;
  scores: Scores;
  statusSugerido: CellStatus;
  papelPossivel: Role;
  observacao: string;
  vozPendente: boolean;
};

const adaptationSchema = z
  .object({
    permanece: text,
    muda: text,
    sai: text,
    recorte: text,
    ordemLeitura: text,
    zonaProtegida: text,
    riscoTruncamento: text,
  })
  .catch({ permanece: "", muda: "", sai: "", recorte: "", ordemLeitura: "", zonaProtegida: "", riscoTruncamento: "" });
export type Adaptation = z.infer<typeof adaptationSchema>;

export const briefingSchema = z.object({
  nome: text,
  papelNaCampanha: text,
  faseBlack: enumOr(PHASES, "pico"),
  publico: text,
  consciencia: enumOr(AWARENESS, "consciente_problema"),
  dor: text,
  pilar: text,
  angulo: text,
  conceito: text,
  hipotese: text,
  stopSignal: text,
  headline: text,
  argumentoApoio: text,
  trustSignal: text,
  produtoOfertaVisiveis: text,
  cta: text,
  direcaoArte: text,
  imagemAncora: text,
  ordemLeitura: text,
  elementosObrigatorios: textList,
  elementosProibidos: textList,
  adaptacoes: z.object({ "4:5": adaptationSchema, "1:1": adaptationSchema, "9:16": adaptationSchema }).catch({
    "4:5": adaptationSchema.parse(undefined),
    "1:1": adaptationSchema.parse(undefined),
    "9:16": adaptationSchema.parse(undefined),
  }),
  copyPrincipal: text,
  titulo: text,
  descricao: text,
  urlDestino: text,
  provaFonte: text,
  riscoCompliance: text,
  variavelTeste: text,
  metricaPrimaria: text,
  metricaNegocio: text,
  proximoPasso: text,
  formatoRecomendado: enumOr(FORMATS, "estatico"),
  roteiroFormato: textList,
});
export type CreativeBriefingBody = z.infer<typeof briefingSchema>;
export type CreativeBriefing = CreativeBriefingBody & {
  id: string;
  cellId: string;
  papel: Role;
  /** Avisos de validação calculados em código (tamanho de headline/CTA, placeholders...). */
  avisos: string[];
};

export const planSchema = z.object({
  resumoExecutivo: text,
  testes: z
    .array(
      z.object({
        id: text,
        estagio: enumOr(["exploracao", "validacao", "escala"] as const, "exploracao"),
        hipotese: text,
        variavel: text,
        controle: text,
        publico: text,
        placement: text,
        destino: text,
        metricaPrimaria: text,
        metricaNegocio: text,
        janela: text,
        criterioLeitura: text,
        limiteEconomico: text,
        aprendizadoEsperado: text,
        acaoSeguinte: text,
      }),
    )
    .catch([]),
  riscos: z.array(z.object({ risco: text, severidade: enumOr(["alta", "media", "baixa"] as const, "media"), mitigacao: text })).catch([]),
  healthScore: z.array(z.object({ criterio: text, nota: z.coerce.number().catch(0), justificativa: text })).catch([]),
  proximosPassos: textList,
});
export type TestPlan = z.infer<typeof planSchema>;

/* ------------------------------------------------------------ projeto completo */

export type AgentInput = {
  url: string;
  objetivo: string;
  fase: Phase;
  oferta: string;
  publico: string;
  materiais: string;
  cpaMax: number | null;
  roasEquilibrio: number | null;
  modelo: AgentModel;
};

export const AGENT_MODELS = ["gpt-4o", "gpt-4o-mini"] as const;
export type AgentModel = (typeof AGENT_MODELS)[number];

export type SourcePage = { tipo: "home" | "categoria" | "produto"; url: string; titulo: string; ok: boolean; erro?: string };

export type MatrixProject = {
  input: AgentInput;
  generatedAt: string;
  paginas: SourcePage[];
  imagemProduto: string | null;
  brief: ProductBrief;
  motivos: BuyingMotive[];
  celulas: MatrixCell[];
  selecionadas: Array<{ cellId: string; papel: Role }>;
  briefings: CreativeBriefing[];
  plano: TestPlan | null;
};

/* --------------------------------------------------------------- pontuação/seleção */

export function totalScore(scores: Scores): number {
  return SCORE_KEYS.reduce((acc, key) => acc + (scores[key] ?? 0), 0);
}

export const MAX_SCORE = SCORE_KEYS.length * 5;

export function normalizePillar(value: string): Pillar | null {
  const v = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((PILLARS as readonly string[]).includes(v)) return v as Pillar;
  if (v === "voz" || v === "voz_do_cliente") return "voz_cliente";
  if (v === "fullfunnel") return "full_funnel";
  return null;
}

/**
 * Escolhe a fila inicial de produção (spec: 3 âncoras + 2 expansões + 1 objeção, e variações extras
 * só até `count`). Regras: nunca seleciona célula bloqueada; só usa "pendente" se faltarem
 * candidatas; evita repetir motivo e pilar entre as âncoras e prefere motivos ainda não usados.
 */
export function selectProduction(cells: MatrixCell[], count = 8): Array<{ cell: MatrixCell; papel: Role }> {
  const rank = (a: MatrixCell, b: MatrixCell) => totalScore(b.scores) - totalScore(a.scores);
  let pool = cells.filter((c) => c.statusSugerido !== "bloqueado" && c.statusSugerido !== "pendente").sort(rank);
  if (pool.length < Math.min(count, cells.length)) {
    const pending = cells.filter((c) => c.statusSugerido === "pendente").sort(rank);
    pool = [...pool, ...pending];
  }

  const chosen: Array<{ cell: MatrixCell; papel: Role }> = [];
  const taken = new Set<string>();
  const usedMotives = new Set<string>();
  const usedPillars = new Set<string>();

  const take = (cell: MatrixCell, papel: Role) => {
    chosen.push({ cell, papel });
    taken.add(cell.id);
    usedMotives.add(cell.motivoId);
    usedPillars.add(cell.pilar);
  };

  const pickBest = (filter: (c: MatrixCell) => boolean): MatrixCell | undefined => {
    const remaining = pool.filter((c) => !taken.has(c.id));
    return (
      remaining.find((c) => filter(c) && !usedMotives.has(c.motivoId) && !usedPillars.has(c.pilar)) ??
      remaining.find((c) => filter(c) && !usedMotives.has(c.motivoId)) ??
      remaining.find((c) => filter(c))
    );
  };

  for (let i = 0; i < 3; i++) {
    const cell = pickBest((c) => c.papelPossivel !== "objecao");
    if (cell) take(cell, "ancora");
  }
  const objection = pickBest((c) => c.papelPossivel === "objecao") ?? undefined;
  const expansions: MatrixCell[] = [];
  for (let i = 0; i < 2; i++) {
    const cell = pickBest((c) => c.papelPossivel !== "objecao" && !expansions.includes(c));
    if (cell) {
      expansions.push(cell);
      take(cell, "expansao");
    }
  }
  if (objection && !taken.has(objection.id)) take(objection, "objecao");
  else {
    const fallback = pickBest(() => true);
    if (fallback) take(fallback, "objecao");
  }
  while (chosen.length < count) {
    const cell = pickBest(() => true);
    if (!cell) break;
    take(cell, "expansao");
  }

  const order: Record<Role, number> = { ancora: 0, expansao: 1, objecao: 2 };
  return chosen.sort((a, b) => order[a.papel] - order[b.papel]);
}

/* ------------------------------------------------------------ validação de texto */

export function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export const HEADLINE_WORDS = { min: 4, max: 9 } as const;
export const CTA_WORDS = { min: 2, max: 4 } as const;

const PLACEHOLDER = /\[(INSERIR|VALIDAR|CONFIRMAR)[^\]]*\]/i;

export function validateBriefing(body: Pick<CreativeBriefingBody, "headline" | "cta" | "copyPrincipal" | "provaFonte">, hasEconomics: boolean, installmentsDiverge = false): string[] {
  const avisos: string[] = [];
  const h = wordCount(body.headline);
  if (h < HEADLINE_WORDS.min || h > HEADLINE_WORDS.max) avisos.push(`Headline com ${h} palavras (o método pede de ${HEADLINE_WORDS.min} a ${HEADLINE_WORDS.max}).`);
  const c = wordCount(body.cta);
  if (c < CTA_WORDS.min || c > CTA_WORDS.max) avisos.push(`CTA com ${c} palavras (o método pede de ${CTA_WORDS.min} a ${CTA_WORDS.max}).`);
  if (!hasEconomics && /\b\d+\s?%|\bR\$\s?\d/.test(`${body.headline} ${body.copyPrincipal}`) && !PLACEHOLDER.test(`${body.headline} ${body.copyPrincipal}`)) {
    avisos.push("Cita número ou desconto sem condição comercial confirmada: conferir antes de produzir.");
  }
  if (installmentsDiverge && /\b\d{1,2}\s?x\b/i.test(`${body.headline} ${body.copyPrincipal}`) && !PLACEHOLDER.test(`${body.headline} ${body.copyPrincipal}`)) {
    avisos.push("Cita parcelamento que está em divergência entre as páginas da loja: confirmar antes de produzir.");
  }
  if (!body.provaFonte.trim()) avisos.push("Sem prova e fonte indicadas.");
  return avisos;
}

/* ------------------------------------------------------------------ health score */

export function healthVerdict(average: number): { label: string; tone: "critico" | "atencao" | "pronto" | "maduro" } {
  if (average >= 9) return { label: "Sistema maduro", tone: "maduro" };
  if (average >= 7) return { label: "Pronto para produzir e testar", tone: "pronto" };
  if (average >= 4) return { label: "Atenção", tone: "atencao" };
  return { label: "Crítico", tone: "critico" };
}

export function healthAverage(scores: Array<{ nota: number }>): number {
  if (scores.length === 0) return 0;
  const sum = scores.reduce((a, s) => a + Math.max(0, Math.min(10, s.nota)), 0);
  return sum / scores.length;
}

/* ---------------------------------------------------------------- guarda de URL */

/**
 * O servidor busca páginas a partir de um endereço digitado pelo usuário. Esta guarda bloqueia
 * endereços internos (SSRF): localhost, redes privadas, metadados de nuvem e portas atípicas.
 */
export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new Error("Endereço inválido. Informe o link completo da loja ou do produto.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Só links http e https são aceitos.");
  if (url.username || url.password) throw new Error("Links com usuário e senha não são aceitos.");
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("Porta não permitida.");

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host.includes(".") && !host.includes(":")) throw new Error("Endereço não permitido.");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) {
    throw new Error("Endereço interno não é permitido.");
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    const blocked =
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
    if (blocked) throw new Error("Endereço interno não é permitido.");
  }
  if (host.includes(":")) {
    const v6 = host;
    if (v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("::ffff:")) {
      throw new Error("Endereço interno não é permitido.");
    }
  }
  if (/^\d+$/.test(host.replace(/\./g, "")) && !ipv4) throw new Error("Endereço não permitido.");
  return url;
}

/* ------------------------------------------------------------ leitura de páginas */

export type PageFacts = {
  titulo: string;
  descricao: string;
  imagem: string | null;
  h1: string[];
  texto: string;
  produto: {
    nome?: string;
    descricao?: string;
    marca?: string;
    preco?: string;
    moeda?: string;
    disponibilidade?: string;
    nota?: string;
    totalAvaliacoes?: string;
    avaliacoes: string[];
  } | null;
  linksProduto: string[];
  linksCategoria: string[];
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "-", mdash: "-", hellip: "..." };

export function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function metaContent(html: string, key: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0] ?? "";
  const content = tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "";
  return decodeEntities(content).trim();
}

function flattenJsonLd(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) node.forEach((n) => flattenJsonLd(n, out));
  else if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    out.push(obj);
    if (obj["@graph"]) flattenJsonLd(obj["@graph"], out);
  }
  return out;
}

const asString = (v: unknown): string | undefined => (typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined);

export function extractPageFacts(html: string, baseUrl: string, textLimit = 6000): PageFacts {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const description = metaContent(html, "og:description") || metaContent(html, "description");
  const ogImage = metaContent(html, "og:image");

  const h1 = Array.from(html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi))
    .map((m) => decodeEntities((m[1] ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 3);

  // JSON-LD (Product): preço, disponibilidade, nota e avaliações reais, quando a loja publica.
  let produto: PageFacts["produto"] = null;
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const nodes = flattenJsonLd(JSON.parse((match[1] ?? "").trim()));
      const product = nodes.find((n) => {
        const type = n["@type"];
        return type === "Product" || (Array.isArray(type) && type.includes("Product"));
      });
      if (!product) continue;
      const offersRaw = product["offers"];
      const offer = (Array.isArray(offersRaw) ? offersRaw[0] : offersRaw) as Record<string, unknown> | undefined;
      const rating = product["aggregateRating"] as Record<string, unknown> | undefined;
      const reviewsRaw = product["review"];
      const reviews = (Array.isArray(reviewsRaw) ? reviewsRaw : reviewsRaw ? [reviewsRaw] : [])
        .map((r) => asString((r as Record<string, unknown>)["reviewBody"]))
        .filter((r): r is string => Boolean(r))
        .slice(0, 5)
        .map((r) => decodeEntities(r).replace(/\s+/g, " ").trim().slice(0, 300));
      const brand = product["brand"];
      produto = {
        ...(asString(product["name"]) ? { nome: decodeEntities(asString(product["name"])!) } : {}),
        ...(asString(product["description"]) ? { descricao: decodeEntities(asString(product["description"])!).slice(0, 600) } : {}),
        ...(asString(brand) ?? asString((brand as Record<string, unknown> | undefined)?.["name"]) ? { marca: asString(brand) ?? asString((brand as Record<string, unknown>)["name"])! } : {}),
        ...(asString(offer?.["price"]) ?? asString(offer?.["lowPrice"]) ? { preco: (asString(offer?.["price"]) ?? asString(offer?.["lowPrice"]))! } : {}),
        ...(asString(offer?.["priceCurrency"]) ? { moeda: asString(offer?.["priceCurrency"])! } : {}),
        ...(asString(offer?.["availability"]) ? { disponibilidade: asString(offer?.["availability"])!.replace(/^.*\//, "") } : {}),
        ...(asString(rating?.["ratingValue"]) ? { nota: asString(rating?.["ratingValue"])! } : {}),
        ...(asString(rating?.["reviewCount"]) ?? asString(rating?.["ratingCount"]) ? { totalAvaliacoes: (asString(rating?.["reviewCount"]) ?? asString(rating?.["ratingCount"]))! } : {}),
        avaliacoes: reviews,
      };
      break;
    } catch {
      // JSON-LD malformado: segue para o próximo bloco.
    }
  }

  const stripped = html
    .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const texto = decodeEntities(stripped)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1)
    .join("\n")
    .slice(0, textLimit);

  const base = (() => {
    try {
      return new URL(baseUrl);
    } catch {
      return null;
    }
  })();
  const links = new Set<string>();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(decodeEntities(m[1] ?? ""), base ?? undefined);
      if (base && u.origin === base.origin) links.add(u.origin + u.pathname);
    } catch {
      // ignora link inválido
    }
  }
  const all = Array.from(links);
  const linksProduto = all.filter((l) => /\/(products?|produtos?|produto|p)\/[^/]+$/i.test(l)).slice(0, 10);
  const linksCategoria = all.filter((l) => /\/(collections?|categorias?|categoria|colecoes|colecao|c)\/[^/]+$/i.test(l)).slice(0, 10);

  let imagem: string | null = null;
  const imgCandidate = ogImage || (produto ? (html.match(/"image"\s*:\s*"([^"]+)"/)?.[1] ?? "") : "");
  if (imgCandidate) {
    try {
      imagem = new URL(imgCandidate, base ?? undefined).toString();
    } catch {
      imagem = null;
    }
  }

  return { titulo: title, descricao: description, imagem, h1, texto, produto, linksProduto, linksCategoria };
}

/** Heurística: a página já é de um produto quando traz JSON-LD de Product ou o caminho típico. */
export function looksLikeProductUrl(url: string): boolean {
  try {
    return /\/(products?|produtos?|produto|p)\/[^/]+\/?$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ utilitários */

export function mergeCellSeeds(seeds: string[]): string[] {
  const clean = seeds.map((s) => s.trim()).filter(Boolean);
  return Array.from(new Set(clean)).slice(0, 3);
}

/* ------------------------------------------------- divergências detectadas em código */

/**
 * Compara o parcelamento citado nas páginas lidas (ex.: faixa do topo "3x sem juros" x página do
 * produto "12x"). A IA costuma não perceber esse conflito, e ele muda a economia do criativo.
 */
export function detectInstallmentDivergence(pages: Array<{ rotulo: string; texto: string }>): string[] {
  const perPage = pages.map((p) => {
    const found = new Set<number>();
    for (const m of p.texto.matchAll(/\b(\d{1,2})\s?x\b(?=[^\n]{0,40}(?:sem\s+juros|de\s+R\$))/gi)) {
      const n = Number(m[1]);
      if (n >= 2 && n <= 24) found.add(n);
    }
    return { rotulo: p.rotulo, valores: Array.from(found).sort((a, b) => a - b) };
  });
  const all = new Set(perPage.flatMap((p) => p.valores));
  if (all.size <= 1) return [];
  const detail = perPage.filter((p) => p.valores.length > 0).map((p) => `${p.rotulo}: ${p.valores.map((v) => `${v}x`).join(", ")}`);
  return [`Parcelamento com valores diferentes nas páginas lidas (${detail.join(" | ")}). Confirmar a condição comercial vigente antes de usar em criativo.`];
}

/* ------------------------------------- aprendizados da análise de posts e anúncios */

/**
 * Transforma a análise do que já foi publicado (matriz de posts e anúncios) em texto para o gate de
 * entrada do agente ("aprendizados de criativos anteriores"). Só entram fatos medidos.
 */
export function buildLearningsText(analysis: {
  resumo: string;
  recomendacoes: string[];
  insights: Array<{ tone: string; title: string; text: string }>;
  posts: Array<{ caption: string; format: string; angle: string; reach: number; totalInteractions: number }>;
  ads: Array<{ name: string; angle: string; spend: number; purchases: number; roas: number }>;
}): string {
  const lines: string[] = ["APRENDIZADOS DE CRIATIVOS ANTERIORES (análise real do Instagram e dos anúncios Meta, feita pelo CRM):"];
  if (analysis.resumo.trim()) lines.push(`Resumo: ${analysis.resumo.trim()}`);
  for (const i of analysis.insights.slice(0, 8)) lines.push(`- [${i.tone}] ${i.title}: ${i.text}`);
  const posts = analysis.posts
    .filter((p) => p.reach > 0)
    .map((p) => ({ ...p, rate: p.totalInteractions / p.reach }))
    .sort((a, b) => b.rate - a.rate);
  if (posts.length >= 4) {
    const fmtPost = (p: (typeof posts)[number]) => `"${p.caption.replace(/\s+/g, " ").slice(0, 80)}" (${p.format}, ${p.angle}, engajamento ${(p.rate * 100).toFixed(1).replace(".", ",")}%)`;
    lines.push(`Posts que mais engajaram: ${posts.slice(0, 3).map(fmtPost).join("; ")}`);
    lines.push(`Posts que menos engajaram: ${posts.slice(-3).map(fmtPost).join("; ")}`);
  }
  const ads = analysis.ads.filter((a) => a.purchases >= MIN_PURCHASES_FOR_LEARNING).sort((a, b) => b.roas - a.roas);
  if (ads.length > 0) {
    lines.push(`Anúncios com compras suficientes: ${ads.slice(0, 4).map((a) => `"${a.name.slice(0, 60)}" (${a.angle}, ROAS ${a.roas.toFixed(2).replace(".", ",")}x, ${a.purchases} compras)`).join("; ")}`);
  }
  for (const r of analysis.recomendacoes.slice(0, 4)) lines.push(`- Recomendação anterior: ${r}`);
  return lines.join("\n").slice(0, 6000);
}

const MIN_PURCHASES_FOR_LEARNING = 3;

/* ------------------------------------------------------ repetição entre headlines */

const STOP = new Set(["de", "do", "da", "dos", "das", "com", "sem", "seu", "sua", "seus", "suas", "o", "a", "os", "as", "e", "para", "pra", "em", "no", "na", "nos", "nas", "que", "um", "uma", "por", "ao", "mais", "nao", "voce"]);

export function headlineTokens(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Duas headlines "dizem a mesma coisa" quando dividem a maior parte das palavras de conteúdo. */
export function headlinesSimilar(a: string, b: string): boolean {
  const ta = new Set(headlineTokens(a));
  const tb = new Set(headlineTokens(b));
  if (ta.size === 0 || tb.size === 0) return false;
  const inter = Array.from(ta).filter((w) => tb.has(w)).length;
  const union = new Set([...ta, ...tb]).size;
  const openingA = a.trim().toLowerCase().split(/\s+/).slice(0, 3).join(" ");
  const openingB = b.trim().toLowerCase().split(/\s+/).slice(0, 3).join(" ");
  const overlap = inter / Math.min(ta.size, tb.size);
  return inter / union >= 0.5 || (inter >= 2 && overlap >= 0.6) || (openingA.split(" ").length === 3 && openingA === openingB);
}

/** Índices das headlines que repetem uma anterior (a primeira ocorrência é mantida). */
export function findDuplicateHeadlines(headlines: string[]): number[] {
  const dup: number[] = [];
  headlines.forEach((h, i) => {
    if (headlines.slice(0, i).some((prev, j) => !dup.includes(j) && headlinesSimilar(h, prev))) dup.push(i);
  });
  return dup;
}
