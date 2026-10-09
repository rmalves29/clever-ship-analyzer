import { z } from "zod";
import {
  buildAdMatrix,
  buildPostMatrix,
  deriveInsights,
  formatOfPost,
  normalizeAngle,
  normalizeCategory,
  type AdMatrix,
  type ClassifiedAd,
  type ClassifiedPost,
  type MatrixInsight,
  type PostMatrix,
} from "./creative-matrix-shared";
import type { InstagramDatePreset } from "./instagram.server";
import type { CreativeInsight } from "./meta-ads.server";

export type MatrixPost = ClassifiedPost & {
  caption: string;
  permalink: string | null;
  thumbnailUrl: string | null;
  timestamp: string;
  likes: number;
  comments: number;
};

export type MatrixAd = ClassifiedAd & {
  name: string;
  thumbnailUrl: string | null;
  roas: number;
};

export type CreativeMatrixResult = {
  datePreset: InstagramDatePreset;
  generatedAt: string;
  posts: MatrixPost[];
  ads: MatrixAd[];
  postMatrix: PostMatrix;
  adMatrix: AdMatrix | null;
  /** Avisos exibidos na tela (ex.: anúncios indisponíveis). */
  notices: string[];
  insights: MatrixInsight[];
  resumo: string;
  recomendacoes: string[];
};

const classificationSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      angulo: z.string().optional(),
      categoria: z.string().optional(),
      menciona_preco: z.boolean().optional(),
    }),
  ),
});

const recommendationSchema = z.object({
  resumo: z.string(),
  recomendacoes: z.array(z.string()).max(6),
});

async function callOpenAiJson<T>(apiKey: string, system: string, user: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI respondeu ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI não retornou conteúdo.");
  return schema.parse(JSON.parse(content));
}

const CLASSIFY_SYSTEM = "Você classifica peças de marketing de uma loja de semijoias e acessórios femininos. Responda sempre em JSON válido, sem texto fora do JSON.";

function classifyPrompt(items: Array<{ id: string; tipo: "post" | "anuncio"; texto: string; formato?: string }>): string {
  return `Classifique cada peça abaixo.

ÂNGULO (a ideia principal da mensagem) — use exatamente um destes valores:
- novidade: lançamento, "chegou", coleção nova
- promocao_cupom: desconto, cupom, oferta, frete grátis, preço promocional
- urgencia_escassez: últimas unidades, só hoje, acaba logo
- prova_social: avaliação de cliente, depoimento, "mais vendido", cliente usando
- presente_ocasiao: Dia das Mães, Natal, aniversário, presente, festa, casamento
- educativo_dica: como combinar, como cuidar, dica de uso
- bastidores_marca: equipe, embalagem, história da marca, processo
- inspiracao_lifestyle: look, estilo, inspiração, sem oferta direta
- outro: nenhum dos anteriores

CATEGORIA (o produto principal) — use exatamente um destes: brinco, colar, anel, pulseira, kit_conjunto, geral
(kit_conjunto = kits e conjuntos com mais de um tipo de peça; geral = vários produtos ou nenhum específico)

menciona_preco: true se o texto cita valor em reais, parcelamento ou desconto numérico.

Para anúncios só existe o NOME do anúncio: classifique pelo que o nome indica e, se não der para saber o ângulo, use "outro".

Peças:
${JSON.stringify(items)}

Responda neste formato exato:
{ "items": [ { "id": string, "angulo": string, "categoria": string, "menciona_preco": boolean } ] }
Devolva uma entrada para cada id recebido, sem inventar ids.`;
}

function recommendationPrompt(input: {
  datePreset: string;
  postMatrix: PostMatrix;
  adMatrix: AdMatrix | null;
  insights: MatrixInsight[];
}): string {
  const compactPosts = Object.entries(input.postMatrix.byAngle).map(([angle, c]) => ({
    angulo: angle,
    posts: c.n,
    alcance_medio: Math.round(c.avgReach),
    engajamento: c.engagementRate === null ? null : Number((c.engagementRate * 100).toFixed(2)),
    salvos_compart_medio: Number(c.avgSavesShares.toFixed(1)),
  }));
  const compactFormats = Object.entries(input.postMatrix.byFormat).map(([format, c]) => ({
    formato: format,
    posts: c.n,
    alcance_medio: Math.round(c.avgReach),
    engajamento: c.engagementRate === null ? null : Number((c.engagementRate * 100).toFixed(2)),
  }));
  const compactAds = input.adMatrix
    ? Object.entries(input.adMatrix.byAngle).map(([angle, c]) => ({
        angulo: angle,
        anuncios: c.n,
        gasto: Math.round(c.spend),
        compras: c.purchases,
        roas: c.roas === null ? null : Number(c.roas.toFixed(2)),
        dados_insuficientes: c.lowData,
      }))
    : null;

  return `Você é estrategista de conteúdo de uma loja de semijoias. Com base na matriz criativa abaixo (período: ${input.datePreset}), escreva um resumo e recomendações práticas.

REGRAS: use SOMENTE os números abaixo; nunca invente dado. Ignore ângulos com menos de 2 posts. Não dê veredito de anúncio quando "dados_insuficientes" for true. Escreva em português do Brasil.

ORGÂNICO POR ÂNGULO: ${JSON.stringify(compactPosts)}
ORGÂNICO POR FORMATO: ${JSON.stringify(compactFormats)}
ANÚNCIOS POR ÂNGULO: ${JSON.stringify(compactAds)}
ACHADOS JÁ CALCULADOS: ${JSON.stringify(input.insights.map((i) => `${i.title}: ${i.text}`))}

Responda neste formato exato:
{ "resumo": string (2-3 frases), "recomendacoes": [ string (ação específica: o que produzir, em qual formato, com qual ângulo, e por quê, citando um número) ] }
Entre 3 e 5 recomendações.`;
}

function fallbackRecommendations(insights: MatrixInsight[]): { resumo: string; recomendacoes: string[] } {
  const positives = insights.filter((i) => i.tone === "positivo");
  return {
    resumo: insights.length > 0
      ? `A matriz encontrou ${insights.length} ponto(s) de atenção ou oportunidade no período.`
      : "Ainda não há amostra suficiente por ângulo para destacar diferenças claras.",
    recomendacoes: positives.slice(0, 4).map((i) => `${i.title}. ${i.text}`),
  };
}

/** Quantas peças de cada tipo entram na classificação (limita tokens e custo da OpenAI). */
const MAX_POSTS = 50;
const MAX_ADS = 60;

export async function buildCreativeMatrix(
  datePreset: InstagramDatePreset,
): Promise<{ success: true; result: CreativeMatrixResult } | { success: false; error: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: settings } = await supabaseAdmin
    .from("store_settings")
    .select("openai_api_key")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const apiKey = (settings as { openai_api_key?: string | null } | null)?.openai_api_key;
  if (!apiKey) return { success: false, error: "Nenhuma API key da OpenAI configurada em Configurações." };

  const { getInstagramAllContent } = await import("./instagram.server");
  const igRes = await getInstagramAllContent(datePreset);
  if (!igRes.success) return { success: false, error: igRes.error };
  const rawPosts = igRes.media.slice(0, MAX_POSTS);
  if (rawPosts.length === 0) {
    return { success: false, error: "Não há publicações nesse período. Escolha um período maior (ex.: 30 dias)." };
  }

  const notices: string[] = [];
  let rawAds: CreativeInsight[] = [];
  try {
    const { getMetaAdsCreatives } = await import("./meta-ads.server");
    const adsRes = await getMetaAdsCreatives(datePreset);
    if (adsRes.success) rawAds = adsRes.result.creatives.filter((c) => c.spend > 0).slice(0, MAX_ADS);
    else notices.push(`Anúncios não incluídos: ${adsRes.error}`);
  } catch (error) {
    notices.push(`Anúncios não incluídos: ${error instanceof Error ? error.message : "falha ao consultar a Meta."}`);
  }

  const items = [
    ...rawPosts.map((p) => ({
      id: `post:${p.id}`,
      tipo: "post" as const,
      formato: formatOfPost(p.productType, p.mediaType),
      texto: (p.caption ?? "").replace(/\s+/g, " ").slice(0, 400),
    })),
    ...rawAds.map((a) => ({ id: `ad:${a.id}`, tipo: "anuncio" as const, texto: a.name.slice(0, 200) })),
  ];

  let classified: z.infer<typeof classificationSchema>;
  try {
    classified = await callOpenAiJson(apiKey, CLASSIFY_SYSTEM, classifyPrompt(items), classificationSchema);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao classificar com a OpenAI." };
  }
  const byId = new Map(classified.items.map((i) => [i.id, i]));

  const posts: MatrixPost[] = rawPosts.map((p) => {
    const c = byId.get(`post:${p.id}`);
    return {
      id: p.id,
      reach: p.reach,
      views: p.views,
      totalInteractions: p.totalInteractions,
      saved: p.saved,
      shares: p.shares,
      format: formatOfPost(p.productType, p.mediaType),
      angle: normalizeAngle(c?.angulo),
      category: normalizeCategory(c?.categoria),
      mentionsPrice: Boolean(c?.menciona_preco),
      caption: (p.caption ?? "").slice(0, 160),
      permalink: p.permalink,
      thumbnailUrl: p.thumbnailUrl,
      timestamp: p.timestamp,
      likes: p.likes,
      comments: p.comments,
    };
  });

  const ads: MatrixAd[] = rawAds.map((a) => {
    const c = byId.get(`ad:${a.id}`);
    return {
      id: a.id,
      spend: a.spend,
      impressions: a.impressions,
      ctrLink: a.ctrLink,
      purchases: a.purchases,
      revenue: a.revenue,
      angle: normalizeAngle(c?.angulo),
      category: normalizeCategory(c?.categoria),
      name: a.name,
      thumbnailUrl: a.thumbnailUrl,
      roas: a.roas,
    };
  });

  const postMatrix = buildPostMatrix(posts);
  const adMatrix = ads.length > 0 ? buildAdMatrix(ads) : null;
  const insights = deriveInsights(postMatrix, adMatrix);

  let summary: { resumo: string; recomendacoes: string[] };
  try {
    summary = await callOpenAiJson(
      apiKey,
      "Você é estrategista de conteúdo para e-commerce de semijoias. Responda sempre em JSON válido.",
      recommendationPrompt({ datePreset, postMatrix, adMatrix, insights }),
      recommendationSchema,
    );
  } catch {
    summary = fallbackRecommendations(insights);
    notices.push("As recomendações da IA falharam; mostrando só os achados calculados.");
  }

  return {
    success: true,
    result: {
      datePreset,
      generatedAt: new Date().toISOString(),
      posts,
      ads,
      postMatrix,
      adMatrix,
      notices,
      insights,
      resumo: summary.resumo,
      recomendacoes: summary.recomendacoes,
    },
  };
}
