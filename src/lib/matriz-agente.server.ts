import { NO_OPENAI_KEY, callOpenAiJson, loadOpenAiKey } from "./openai-json.server";
import {
  HEALTH_CRITERIA,
  PILLARS,
  assertPublicHttpUrl,
  briefSchema,
  briefingSchema,
  cellResponseSchema,

  extractPageFacts,
  detectInstallmentDivergence,
  findDuplicateHeadlines,
  looksLikeProductUrl,
  mergeCellSeeds,
  motivesResponseSchema,
  normalizePillar,
  planSchema,
  validateBriefing,
  type AgentInput,
  type BuyingMotive,
  type CreativeBriefing,
  type MatrixCell,
  type PageFacts,
  type ProductBrief,
  type Role,
  type SourcePage,
  type TestPlan,
} from "./matriz-agente-shared";
import { SYSTEM_PROMPT, briefPrompt, briefingPrompt, cellsPrompt, fixBriefingPrompt, motivesPrompt, planPrompt, rewriteHeadlinePrompt } from "./matriz-agente-prompts";
import { z } from "zod";

/* ------------------------------------------------------------ leitura de páginas */

const USER_AGENT = "Mozilla/5.0 (compatible; CRM-ManiaDeMulher/1.0; +https://crm.maniadmulher.com)";

async function readLimited(res: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer()).slice(0, maxBytes);
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const out = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const room = out.length - offset;
    if (room <= 0) break;
    out.set(chunk.subarray(0, room), offset);
    offset += Math.min(chunk.byteLength, room);
  }
  return out;
}

/** Busca segura: valida o destino a cada redirecionamento e limita tempo e tamanho. */
async function safeFetch(rawUrl: string, opts: { maxBytes: number; timeoutMs: number; accept: string }): Promise<{ res: Response; bytes: Uint8Array; finalUrl: string }> {
  let url = assertPublicHttpUrl(rawUrl);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(opts.timeoutMs),
      headers: { "user-agent": USER_AGENT, accept: opts.accept, "accept-language": "pt-BR,pt;q=0.9" },
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error(`Redirecionamento sem destino (${res.status}).`);
      url = assertPublicHttpUrl(new URL(location, url).toString());
      continue;
    }
    if (!res.ok) throw new Error(`A página respondeu ${res.status}.`);
    const bytes = await readLimited(res, opts.maxBytes);
    return { res, bytes, finalUrl: url.toString() };
  }
  throw new Error("Redirecionamentos demais.");
}

async function fetchPage(url: string): Promise<{ finalUrl: string; html: string }> {
  const { res, bytes, finalUrl } = await safeFetch(url, { maxBytes: 1_800_000, timeoutMs: 10_000, accept: "text/html,application/xhtml+xml" });
  const type = res.headers.get("content-type") ?? "";
  if (!/html|xml|text/i.test(type)) throw new Error("O endereço não devolveu uma página HTML.");
  return { finalUrl, html: new TextDecoder("utf-8").decode(bytes) };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(binary);
}

/** Foto do produto embutida no HTML final (arquivo autocontido). Descarta imagens grandes. */
async function fetchImageDataUri(url: string): Promise<string | null> {
  try {
    const { res, bytes } = await safeFetch(url, { maxBytes: 420_000, timeoutMs: 8_000, accept: "image/*" });
    const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(type)) return null;
    if (bytes.byteLength >= 419_999) return null; // truncada: arquivo maior que o limite
    return `data:${type};base64,${toBase64(bytes)}`;
  } catch {
    return null;
  }
}

/** Lojas Shopee/Shopify expõem /products/<handle>.js com preço e variantes reais. */
async function fetchShopifyProduct(productUrl: string): Promise<string | null> {
  try {
    const u = new URL(productUrl);
    const handle = u.pathname.match(/\/products\/([^/]+)/)?.[1];
    if (!handle) return null;
    const { bytes } = await safeFetch(`${u.origin}/products/${handle}.js`, { maxBytes: 200_000, timeoutMs: 6_000, accept: "application/json" });
    const j = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    const cents = (v: unknown) => (typeof v === "number" ? (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : undefined);
    const variants = Array.isArray(j["variants"]) ? (j["variants"] as Array<Record<string, unknown>>) : [];
    return JSON.stringify({
      titulo: j["title"],
      tipo: j["type"],
      fornecedor: j["vendor"],
      preco: cents(j["price"]),
      precoComparacao: cents(j["compare_at_price"]),
      disponivel: j["available"],
      variantes: variants.length,
      tags: j["tags"],
    });
  } catch {
    return null;
  }
}

function pageDigest(kind: SourcePage["tipo"], url: string, facts: PageFacts, extra: string | null): string {
  const produto = facts.produto
    ? `Dados estruturados do produto: ${JSON.stringify(facts.produto)}`
    : "Dados estruturados do produto: (nenhum)";
  return [
    `### PÁGINA (${kind}) ${url}`,
    `Título: ${facts.titulo}`,
    `Descrição: ${facts.descricao}`,
    facts.h1.length ? `H1: ${facts.h1.join(" | ")}` : "",
    produto,
    extra ? `Dados da plataforma da loja: ${extra}` : "",
    `Texto da página:\n${facts.texto.slice(0, 3200)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export type SourcesResult = {
  paginas: SourcePage[];
  imagemProduto: string | null;
  brief: ProductBrief;
};

/* ---------------------------------------------------------------- etapa 1: fontes */

export async function stageSources(input: AgentInput, apiKey: string): Promise<SourcesResult> {
  const start = assertPublicHttpUrl(input.url);
  const paginas: SourcePage[] = [];
  const digests: string[] = [];
  const detection: Array<{ rotulo: string; texto: string }> = [];
  const realReviews: string[] = [];
  let productFacts: PageFacts | null = null;
  let productUrl: string | null = null;

  const load = async (kind: SourcePage["tipo"], url: string): Promise<{ facts: PageFacts; finalUrl: string } | null> => {
    try {
      const { finalUrl, html } = await fetchPage(url);
      const facts = extractPageFacts(html, finalUrl, 60000);
      detection.push({ rotulo: kind, texto: facts.texto });
      realReviews.push(...(facts.produto?.avaliacoes ?? []));
      const extra = kind === "produto" ? await fetchShopifyProduct(finalUrl) : null;
      digests.push(pageDigest(kind, finalUrl, facts, extra));
      paginas.push({ tipo: kind, url: finalUrl, titulo: facts.titulo, ok: true });
      return { facts, finalUrl };
    } catch (error) {
      paginas.push({ tipo: kind, url, titulo: "", ok: false, erro: error instanceof Error ? error.message : "falha ao ler" });
      return null;
    }
  };

  const first = await fetchPage(start.toString()).catch((error: unknown) => {
    throw new Error(`Não consegui abrir o link informado: ${error instanceof Error ? error.message : "falha de rede"}`);
  });
  const firstFacts = extractPageFacts(first.html, first.finalUrl, 60000);
  const isProduct = Boolean(firstFacts.produto) || looksLikeProductUrl(first.finalUrl);
  const firstKind: SourcePage["tipo"] = isProduct ? "produto" : new URL(first.finalUrl).pathname.replace(/\/+$/, "") === "" ? "home" : "categoria";
  {
    const extra = firstKind === "produto" ? await fetchShopifyProduct(first.finalUrl) : null;
    digests.push(pageDigest(firstKind, first.finalUrl, firstFacts, extra));
    paginas.push({ tipo: firstKind, url: first.finalUrl, titulo: firstFacts.titulo, ok: true });
    detection.push({ rotulo: firstKind, texto: firstFacts.texto });
    realReviews.push(...(firstFacts.produto?.avaliacoes ?? []));
  }
  if (isProduct) {
    productFacts = firstFacts;
    productUrl = first.finalUrl;
  }

  const origin = new URL(first.finalUrl).origin;
  const tasks: Array<Promise<unknown>> = [];
  if (firstKind !== "home") tasks.push(load("home", `${origin}/`));
  if (!isProduct) {
    const link = firstFacts.linksProduto[0];
    if (link) {
      tasks.push(
        load("produto", link).then((r) => {
          if (r) {
            productFacts = r.facts;
            productUrl = r.finalUrl;
          }
        }),
      );
    }
  }
  const categoryLink = firstKind === "categoria" ? null : firstFacts.linksCategoria[0];
  if (categoryLink) tasks.push(load("categoria", categoryLink));
  await Promise.all(tasks);

  const imageUrl = (productFacts as PageFacts | null)?.imagem ?? firstFacts.imagem;
  const imagemProduto = imageUrl ? await fetchImageDataUri(imageUrl) : null;

  const brief = await callOpenAiJson({
    apiKey,
    model: input.modelo,
    system: SYSTEM_PROMPT,
    user: briefPrompt(input, digests.join("\n\n").slice(0, 16000)),
    schema: briefSchema,
    maxTokens: 3500,
  });

  // Rastreabilidade garantida em código: toda página lida e todo anexo viram fonte, mesmo que a IA omita.
  const known = new Set(brief.fontes.map((f) => f.origem));
  for (const p of paginas.filter((x) => x.ok && !known.has(x.url))) {
    brief.fontes.push({ tipo: "pagina_oficial", origem: p.url, resumo: p.titulo || `Página ${p.tipo} lida pelo agente` });
  }
  if (input.materiais.trim() && !brief.fontes.some((f) => f.tipo === "anexo")) {
    brief.fontes.unshift({ tipo: "anexo", origem: "Materiais informados pelo usuário", resumo: "Texto colado ou anexado na tela do agente" });
  }
  for (const d of detectInstallmentDivergence(detection)) if (!brief.divergencias.some((x) => /parcel/i.test(x))) brief.divergencias.push(d);
  brief.avaliacoesReais = Array.from(new Set(realReviews)).slice(0, 8);
  if (!brief.urlDestino.trim()) brief.urlDestino = productUrl ?? first.finalUrl;
  if (!brief.objetivo.trim()) brief.objetivo = input.objetivo;
  if (input.cpaMax === null && input.roasEquilibrio === null && !brief.pendencias.some((p) => /CPA|ROAS/i.test(p))) {
    brief.pendencias.push("Informar CPA máximo e ROAS de equilíbrio: sem eles não há régua de escala.");
  }
  return { paginas, imagemProduto, brief };
}

/* --------------------------------------------------------------- etapa 2: motivos */

export async function stageMotives(input: AgentInput, brief: ProductBrief, apiKey: string): Promise<BuyingMotive[]> {
  const res = await callOpenAiJson({
    apiKey,
    model: input.modelo,
    system: SYSTEM_PROMPT,
    user: motivesPrompt(brief),
    schema: motivesResponseSchema,
    temperature: 0.4,
    maxTokens: 3000,
  });
  const seen = new Set<string>();
  const motivos = res.motivos
    .filter((m) => m.nome.trim())
    .slice(0, 6)
    .map((m, i) => {
      let id = m.id.trim() || `M${i + 1}`;
      if (seen.has(id)) id = `M${i + 1}`;
      seen.add(id);
      return { ...m, id };
    });
  if (motivos.length < 2) throw new Error("A IA não conseguiu mapear motivos de compra suficientes. Tente de novo ou complete a oferta e o público.");
  return motivos;
}

/* --------------------------------------------------------------- etapa 3: matriz */

function asVoiceTheme(seed: string): string {
  const clean = seed.replace(/[\u201C\u201D"]/g, "").replace(/^\s*(SENTIMENTO|TEMAS?|TEMA)\s*:\s*/i, "").trim();
  return clean.startsWith("[INSERIR REVIEW REAL]") ? clean : `[INSERIR REVIEW REAL] Tema a validar: ${clean}`;
}


export async function stageMatrix(input: AgentInput, brief: ProductBrief, motives: BuyingMotive[], apiKey: string): Promise<{ celulas: MatrixCell[]; avisos: string[] }> {
  const avisos: string[] = [];
  const perMotive = await Promise.all(
    motives.map(async (motive) => {
      try {
        const res = await callOpenAiJson({
          apiKey,
          model: input.modelo,
          system: SYSTEM_PROMPT,
          user: cellsPrompt(brief, motive),
          schema: cellResponseSchema,
          temperature: 0.7,
          maxTokens: 3500,
        });
        const cells: MatrixCell[] = [];
        const used = new Set<string>();
        for (const raw of res.celulas) {
          const pilar = normalizePillar(raw.pilar);
          if (!pilar || used.has(pilar)) continue;
          used.add(pilar);
          const sementes = mergeCellSeeds(raw.sementes);
          if (sementes.length === 0) continue;
          const hasRealVoice = brief.avaliacoesReais.length > 0 || /review|avalia[cç][aã]o|depoimento|pesquisa/i.test(input.materiais);
          const voiceUnverified = pilar === "voz_cliente" && !hasRealVoice;
          cells.push({
            id: `${motive.id}-${pilar}`,
            motivoId: motive.id,
            pilar,
            // Sem fala real, a IA não pode simular citação: vira tema a validar com placeholder visível.
            sementes: voiceUnverified ? sementes.map(asVoiceTheme) : sementes,
            consciencia: raw.consciencia,
            scores: voiceUnverified ? { ...raw.scores, evidencia: Math.min(raw.scores.evidencia, 1), prova: Math.min(raw.scores.prova, 1) } : raw.scores,
            // "Rodando" só vale com dados de mídia comprovados, que este agente não recebe.
            statusSugerido: voiceUnverified ? "pendente" : raw.statusSugerido === "rodando" ? "testar" : raw.statusSugerido,
            papelPossivel: raw.papelPossivel,
            observacao: voiceUnverified && !raw.observacao.includes("INSERIR REVIEW REAL") ? `${raw.observacao} Falta fala real de cliente: [INSERIR REVIEW REAL].`.trim() : raw.observacao,
            vozPendente: raw.vozPendente || voiceUnverified,
          });
        }
        if (cells.length < PILLARS.length) avisos.push(`${motive.nome}: a IA devolveu ${cells.length} de ${PILLARS.length} pilares.`);
        return cells;
      } catch (error) {
        avisos.push(`${motive.nome}: falha ao gerar células (${error instanceof Error ? error.message : "erro"}).`);
        return [] as MatrixCell[];
      }
    }),
  );
  const celulas = perMotive.flat();
  if (celulas.length === 0) throw new Error("Não foi possível gerar a matriz. Verifique a chave da OpenAI e tente de novo.");
  return { celulas, avisos };
}

/* ------------------------------------------------------------- etapa 5: briefings */

function hasConfirmedEconomics(brief: ProductBrief): boolean {
  const c = brief.condicaoComercial.trim();
  return c.length > 0 && !/\[(VALIDAR|CONFIRMAR|INSERIR)/i.test(c);
}

/** Variedade de formato da fila (bateria do método: estático, carrossel, UGC, vídeo, remarketing). */
const FORMAT_HINTS = [
  "estático 4:5",
  "carrossel sequencial",
  "vídeo / UGC",
  "estático 4:5",
  "carrossel modular",
  "vídeo / UGC",
  "remarketing",
  "estático 4:5",
];

async function oneBriefing(
  input: AgentInput,
  brief: ProductBrief,
  motive: BuyingMotive | undefined,
  cell: MatrixCell,
  papel: Role,
  imageAvailable: boolean,
  index: number,
  apiKey: string,
): Promise<CreativeBriefing> {
  const economics = hasConfirmedEconomics(brief);
  const diverge = brief.divergencias.some((d) => /parcel/i.test(d));
  let body = await callOpenAiJson({
    apiKey,
    model: input.modelo,
    system: SYSTEM_PROMPT,
    user: briefingPrompt(input, brief, motive, cell, papel, imageAvailable, FORMAT_HINTS[index % FORMAT_HINTS.length]!),
    schema: briefingSchema,
    temperature: 0.7,
    maxTokens: 4000,
  });
  let avisos = validateBriefing(body, economics, diverge);
  const hard = avisos.filter((a) => a.startsWith("Headline") || a.startsWith("CTA"));
  if (hard.length > 0) {
    try {
      const fixed = await callOpenAiJson({
        apiKey,
        model: input.modelo,
        system: SYSTEM_PROMPT,
        user: fixBriefingPrompt(JSON.stringify(body), hard),
        schema: briefingSchema,
        temperature: 0.3,
        maxTokens: 4000,
        retries: 0,
      });
      const fixedAvisos = validateBriefing(fixed, economics, diverge);
      if (fixedAvisos.filter((a) => a.startsWith("Headline") || a.startsWith("CTA")).length <= hard.length) {
        body = fixed;
        avisos = fixedAvisos;
      }
    } catch {
      // mantém o briefing original com os avisos
    }
  }
  if (!body.urlDestino.trim()) body = { ...body, urlDestino: brief.urlDestino };
  return { ...body, id: `C${index + 1}`, cellId: cell.id, papel, avisos };
}

export async function stageBriefings(
  input: AgentInput,
  brief: ProductBrief,
  motives: BuyingMotive[],
  selected: Array<{ cell: MatrixCell; papel: Role; index: number }>,
  imageAvailable: boolean,
  apiKey: string,
): Promise<CreativeBriefing[]> {
  const results = await Promise.all(
    selected.map(async ({ cell, papel, index }) => {
      try {
        return await oneBriefing(input, brief, motives.find((m) => m.id === cell.motivoId), cell, papel, imageAvailable, index, apiKey);
      } catch (error) {
        throw new Error(`Briefing ${index + 1} (${cell.id}): ${error instanceof Error ? error.message : "falha"}`);
      }
    }),
  );
  return results;
}

/* ------------------------------------------------- revisão: headlines repetidas */

const rewriteSchema = z.object({ headline: z.string().catch(""), cta: z.string().catch(""), copyPrincipal: z.string().catch("") });

/**
 * Briefings são escritos em paralelo e não se enxergam: é comum várias peças saírem com a mesma tese.
 * Aqui o código detecta headlines repetidas e pede a reescrita só dessas, com as demais como "evite".
 */
export async function stageReview(input: AgentInput, brief: ProductBrief, briefings: CreativeBriefing[], apiKey: string): Promise<CreativeBriefing[]> {
  const duplicates = findDuplicateHeadlines(briefings.map((b) => b.headline)).slice(0, 5);
  if (duplicates.length === 0) return briefings;
  const economics = hasConfirmedEconomics(brief);
  const diverge = brief.divergencias.some((d) => /parcel/i.test(d));
  const out = [...briefings];
  for (const index of duplicates) {
    const current = out[index]!;
    try {
      const avoid = out.filter((_, i) => i !== index).map((b) => b.headline);
      const next = await callOpenAiJson({
        apiKey,
        model: input.modelo,
        system: SYSTEM_PROMPT,
        user: rewriteHeadlinePrompt(brief, current, avoid),
        schema: rewriteSchema,
        temperature: 0.9,
        maxTokens: 600,
        retries: 0,
      });
      if (!next.headline.trim()) continue;
      const candidate = { ...current, headline: next.headline.trim(), cta: next.cta.trim() || current.cta, copyPrincipal: next.copyPrincipal.trim() || current.copyPrincipal };
      const avisos = validateBriefing(candidate, economics, diverge);
      out[index] = { ...candidate, avisos: [...avisos, "Headline reescrita para não repetir a tese de outra peça da fila."] };
    } catch {
      // mantém a original; a repetição aparece nos avisos
      out[index] = { ...current, avisos: [...current.avisos, "Headline parecida com a de outra peça da fila."] };
    }
  }
  return out;
}

/* ------------------------------------------------------------------ etapa 6: plano */

const MIN_TESTS = 6;
const NO_RULE = "Definir CPA máximo e ROAS de equilíbrio antes de escalar";

export async function stagePlan(
  input: AgentInput,
  brief: ProductBrief,
  motives: BuyingMotive[],
  briefings: CreativeBriefing[],
  cellsCount: number,
  blockedOrPending: number,
  apiKey: string,
): Promise<TestPlan> {
  const planUser = planPrompt(
    input,
    brief,
    motives,
    briefings.map((b) => ({ id: b.id, papel: b.papel, nome: b.nome, headline: b.headline, cta: b.cta, hipotese: b.hipotese, variavelTeste: b.variavelTeste, metricaPrimaria: b.metricaPrimaria, pilar: b.pilar, formatoRecomendado: b.formatoRecomendado })),
    cellsCount,
    blockedOrPending,
  );
  const askPlan = (user: string) =>
    callOpenAiJson({ apiKey, model: input.modelo, system: SYSTEM_PROMPT, user, schema: planSchema, temperature: 0.4, maxTokens: 7000 });

  let plan = await askPlan(planUser);
  // O método pede de 6 a 10 testes: com menos, uma nova tentativa com a exigência repetida.
  if (plan.testes.length < MIN_TESTS) {
    try {
      const again = await askPlan(`${planUser}\n\nATENÇÃO: a resposta anterior trouxe só ${plan.testes.length} testes. Devolva o JSON completo com no mínimo ${MIN_TESTS} testes (exploração, validação e escala).`);
      if (again.testes.length > plan.testes.length) plan = again;
    } catch {
      // mantém o plano original
    }
  }

  const noEconomics = input.cpaMax === null && input.roasEquilibrio === null;
  const testes = plan.testes.map((t, i) => ({
    ...t,
    id: t.id.trim() || `T${i + 1}`,
    // Sem régua informada, qualquer número no limite econômico foi inventado: troca pela pendência.
    limiteEconomico: noEconomics && (/\d/.test(t.limiteEconomico) || !t.limiteEconomico.trim()) ? NO_RULE : t.limiteEconomico,
  }));

  // Health Score: exatamente os 10 critérios, na ordem do método, com tetos objetivos.
  const hasRealProof = brief.claims.some((c) => c.status === "comprovada") || brief.fontes.some((f) => f.tipo === "avaliacoes");
  const healthScore = HEALTH_CRITERIA.map((criterio, i) => {
    const found = plan.healthScore.find((h) => h.criterio.trim().toLowerCase() === criterio.toLowerCase()) ?? plan.healthScore[i];
    let nota = found ? Math.max(0, Math.min(10, found.nota)) : 0;
    if (criterio === "Fidelidade e prova" && !hasRealProof) nota = Math.min(nota, 6);
    if (criterio === "Coerência econômica" && noEconomics) nota = Math.min(nota, 5);
    return { criterio, nota: Math.round(nota * 10) / 10, justificativa: found?.justificativa ?? "" };
  });
  return { ...plan, testes, healthScore };
}

/* -------------------------------------------------------------------- despacho */

export type StageRequest =
  | { stage: "fontes"; input: AgentInput }
  | { stage: "motivos"; input: AgentInput; brief: ProductBrief }
  | { stage: "matriz"; input: AgentInput; brief: ProductBrief; motivos: BuyingMotive[] }
  | {
      stage: "briefings";
      input: AgentInput;
      brief: ProductBrief;
      motivos: BuyingMotive[];
      itens: Array<{ cell: MatrixCell; papel: Role; index: number }>;
      imagemDisponivel: boolean;
    }
  | { stage: "revisao"; input: AgentInput; brief: ProductBrief; briefings: CreativeBriefing[] }
  | {
      stage: "plano";
      input: AgentInput;
      brief: ProductBrief;
      motivos: BuyingMotive[];
      briefings: CreativeBriefing[];
      totalCelulas: number;
      pendentesOuBloqueadas: number;
    };

export type StageResult =
  | { success: true; stage: "fontes"; data: SourcesResult }
  | { success: true; stage: "motivos"; data: { motivos: BuyingMotive[] } }
  | { success: true; stage: "matriz"; data: { celulas: MatrixCell[]; avisos: string[] } }
  | { success: true; stage: "briefings"; data: { briefings: CreativeBriefing[] } }
  | { success: true; stage: "revisao"; data: { briefings: CreativeBriefing[] } }
  | { success: true; stage: "plano"; data: { plano: TestPlan } }
  | { success: false; error: string };

export async function runStage(req: StageRequest): Promise<StageResult> {
  const apiKey = await loadOpenAiKey();
  if (!apiKey) return { success: false, error: NO_OPENAI_KEY };
  try {
    switch (req.stage) {
      case "fontes":
        return { success: true, stage: "fontes", data: await stageSources(req.input, apiKey) };
      case "motivos":
        return { success: true, stage: "motivos", data: { motivos: await stageMotives(req.input, req.brief, apiKey) } };
      case "matriz":
        return { success: true, stage: "matriz", data: await stageMatrix(req.input, req.brief, req.motivos, apiKey) };
      case "briefings":
        return { success: true, stage: "briefings", data: { briefings: await stageBriefings(req.input, req.brief, req.motivos, req.itens, req.imagemDisponivel, apiKey) } };
      case "revisao":
        return { success: true, stage: "revisao", data: { briefings: await stageReview(req.input, req.brief, req.briefings, apiKey) } };
      case "plano":
        return { success: true, stage: "plano", data: { plano: await stagePlan(req.input, req.brief, req.motivos, req.briefings, req.totalCelulas, req.pendentesOuBloqueadas, apiKey) } };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao executar o agente." };
  }
}


