import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { z } from "zod";

const datePresetSchema = z.enum(["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month", "last_month"]);

const igInsightSchema = z.object({
  title: z.string(),
  tone: z.enum(["positivo", "atencao", "critico"]),
  text: z.string(),
});

const igAnalysisSchema = z.object({
  resumo: z.string(),
  insights: z.array(igInsightSchema).min(3).max(8),
  recomendacoes: z.array(z.string()).max(6),
});

function buildPrompt(input: {
  username: string | undefined;
  overview: Awaited<ReturnType<typeof import("./instagram.server").getInstagramOverview>>;
  audience: Awaited<ReturnType<typeof import("./instagram.server").getInstagramAudience>>;
  topContent: Awaited<ReturnType<typeof import("./instagram.server").getInstagramTopContent>>;
  period: string;
}) {
  const overview = input.overview.success ? input.overview.overview : null;
  const audience = input.audience.success ? input.audience.audience : null;
  const topContent = input.topContent.success ? input.topContent.media.slice(0, 5) : [];

  return `Você é um analista de social media para e-commerce. Analise os dados reais abaixo da conta @${input.username ?? "conta"} no Instagram (período: ${input.period}) e devolva um diagnóstico estratégico.

VISÃO GERAL:
${overview ? JSON.stringify({
  seguidores: overview.followersCount,
  publicacoes: overview.mediaCount,
  alcance: overview.reachTotal,
  contasEngajadas: overview.accountsEngaged,
  interacoes: overview.totalInteractions,
  visitasAoPerfil: overview.profileViews,
  cliquesNoLink: overview.websiteClicks,
  alcancePorDia: overview.reachByDay,
}) : "indisponível"}

PÚBLICO (dados demográficos reais dos seguidores):
${audience ? JSON.stringify({
  idade: audience.age.map((a) => `${a.label}: ${(a.pct * 100).toFixed(1)}%`),
  genero: audience.gender.map((g) => `${g.label}: ${(g.pct * 100).toFixed(1)}%`),
  topPaises: audience.topCountries.slice(0, 5).map((c) => `${c.label}: ${(c.pct * 100).toFixed(1)}%`),
  topCidades: audience.topCities.slice(0, 5).map((c) => `${c.label}: ${(c.pct * 100).toFixed(1)}%`),
}) : "indisponível"}

TOP 5 CONTEÚDOS DO PERÍODO (por interações totais):
${topContent.length
  ? topContent
      .map(
        (m, i) =>
          `${i + 1}. [${m.productType}] "${(m.caption ?? "").slice(0, 80)}" — alcance ${m.reach}, curtidas ${m.likes}, comentários ${m.comments}, compartilhamentos ${m.shares}, salvos ${m.saved}, interações totais ${m.totalInteractions}`,
      )
      .join("\n")
  : "nenhum conteúdo publicado nesse período"}

Responda em JSON estrito com este formato exato (nada de texto fora do JSON):
{
  "resumo": string (2-3 frases, visão executiva do período),
  "insights": [ { "title": string, "tone": "positivo"|"atencao"|"critico", "text": string (1-2 frases, o porquê, sempre citando um número real dos dados acima) } ],
  "recomendacoes": [ string (ação prática e específica, ex: "poste mais conteúdo em formato Reels, que teve X% mais alcance que Feed no período") ]
}

Gere de 4 a 6 insights cobrindo alcance/crescimento, engajamento, público (demografia) e os conteúdos que mais performaram. Gere de 3 a 5 recomendações práticas e específicas, sempre ancoradas nos números reais fornecidos — nunca invente dado que não esteja acima. Escreva em português do Brasil.`;
}

async function callOpenAi(apiKey: string, prompt: string) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Você é um analista de social media sênior para e-commerce. Responda sempre em JSON válido." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`OpenAI respondeu ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI não retornou conteúdo.");

  return igAnalysisSchema.parse(JSON.parse(content));
}

export const getLatestInstagramAnalysis = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("store_settings")
    .select("instagram_latest_analysis, instagram_latest_analysis_at, instagram_latest_analysis_period, openai_api_key")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const row = data as any;
  return {
    analysis: (row?.instagram_latest_analysis as z.infer<typeof igAnalysisSchema> | null) ?? null,
    generatedAt: row?.instagram_latest_analysis_at ?? null,
    period: row?.instagram_latest_analysis_period ?? null,
    hasApiKey: Boolean(row?.openai_api_key),
  };
});

/** Botão "Gerar análise": busca visão geral + público + top conteúdo reais e pede pro ChatGPT analisar. */
export const generateInstagramAnalysis = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ datePreset: datePresetSchema }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getInstagramOverview, getInstagramAudience, getInstagramTopContent, getInstagramConnectionStatus } = await import("./instagram.server");

    const { data: settings } = await supabaseAdmin
      .from("store_settings")
      .select("id, openai_api_key")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!settings?.openai_api_key) {
      return { success: false as const, error: "Nenhuma API key da OpenAI configurada em Configurações." };
    }

    const [connection, overview, audience, topContent] = await Promise.all([
      getInstagramConnectionStatus(),
      getInstagramOverview(data.datePreset),
      getInstagramAudience(),
      getInstagramTopContent(data.datePreset),
    ]);

    const prompt = buildPrompt({ username: connection.username, overview, audience, topContent, period: data.datePreset });

    let analysis: z.infer<typeof igAnalysisSchema>;
    try {
      analysis = await callOpenAi(settings.openai_api_key, prompt);
    } catch (err) {
      return { success: false as const, error: err instanceof Error ? err.message : "Falha ao chamar a OpenAI." };
    }

    const generatedAt = new Date().toISOString();
    const { error: saveError } = await supabaseAdmin
      .from("store_settings")
      .update({
        instagram_latest_analysis: analysis,
        instagram_latest_analysis_at: generatedAt,
        instagram_latest_analysis_period: data.datePreset,
        updated_at: generatedAt,
      } as never)
      .eq("id", settings.id);

    if (saveError) {
      return { success: false as const, error: `Análise gerada, mas falhou ao salvar: ${saveError.message}` };
    }

    return { success: true as const, analysis, generatedAt };
  });
