import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { z } from "zod";

const datePresetSchema = z.enum(["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month", "last_month"]);

const aiInsightSchema = z.object({
  title: z.string(),
  text: z.string(),
  tone: z.enum(["positivo", "atencao", "critico"]),
});

const aiAnalysisSchema = z.object({
  resumo: z.string(),
  insights: z.array(aiInsightSchema).min(3).max(8),
  recomendacoes: z.array(z.string()).max(6),
});

function buildPrompt(data: {
  datePreset: string;
  summary: Awaited<ReturnType<typeof import("./meta-ads.server").getMetaAdsSummary>>;
  campaigns: Awaited<ReturnType<typeof import("./meta-ads.server").getMetaAdsRows>>;
  dayparting: Awaited<ReturnType<typeof import("./meta-ads.server").getMetaAdsDayparting>>;
  pulse: Awaited<ReturnType<typeof import("./meta-ads.server").getMetaAdsPulse>>;
  creatives: Awaited<ReturnType<typeof import("./meta-ads.server").getMetaAdsCreatives>>;
  planBaseline: Awaited<ReturnType<typeof import("./meta-ads.server").getMetaAdsPlanningBaseline>>;
  plan: Awaited<ReturnType<typeof import("./meta-ads.server").getMetaAdsPlan>>;
}) {
  const s = data.summary.success ? data.summary.summary : null;

  const campaignsText = data.campaigns.success
    ? [...data.campaigns.rows]
        .sort((a, b) => b.spend - a.spend)
        .slice(0, 8)
        .map((c) => `"${c.name}" (${c.status}): gasto R$${c.spend.toFixed(2)}, ${c.purchases} compras, ROAS ${c.roas.toFixed(2)}, CPA R$${c.cpa.toFixed(2)}`)
        .join("\n")
    : "sem dados de campanhas";

  const dp = data.dayparting.success ? data.dayparting.result : null;
  const daypartingText = dp
    ? `ROAS da conta: ${dp.accountRoas.toFixed(2)}. Melhor horário: ${dp.bestHour ? `${dp.bestHour.hour}h (ROAS ${dp.bestHour.roas.toFixed(2)})` : "n/d"}. Pior horário (mais desperdício): ${dp.worstHour ? `${dp.worstHour.hour}h (R$${dp.worstHour.spend.toFixed(2)} gasto)` : "n/d"}. Gasto total estimado em horas sem retorno: R$${dp.wasteSpend.toFixed(2)}.`
    : "sem dados de dayparting";

  const pl = data.pulse.success ? data.pulse.result : null;
  const pulseText = pl
    ? `${pl.rows.length} anúncios ativos analisados. ${pl.noReturnCount} anúncio(s) com gasto de R$${pl.noReturnSpend.toFixed(2)} SEM nenhuma compra. Potencial de receita adicional estimado se escalar os anúncios acima da média (upside): R$${pl.upsideEstimate.toFixed(2)}. Anúncios quebrando alguma regra de CPA/ROAS ativa: ${pl.rows.filter((r) => r.brokenRules.length > 0).length}.`
    : "sem dados de ad pulse";

  const cr = data.creatives.success ? data.creatives.result : null;
  const freshCounts = cr
    ? cr.creatives.reduce(
        (acc, c) => {
          if (c.freshness) acc[c.freshness] = (acc[c.freshness] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      )
    : {};
  const creativesText = cr
    ? `CPM médio R$${cr.summary.cpm.toFixed(2)}, thumb-stop rate ${(cr.summary.thumbstop * 100).toFixed(1)}%, CTR (todos os cliques) ${(cr.summary.ctrAll * 100).toFixed(2)}%, CTR de link ${(cr.summary.ctrLink * 100).toFixed(2)}%.
Distribuição por frescor dos criativos: ${Object.entries(freshCounts).map(([k, v]) => `${k}: ${v}`).join(", ") || "sem dados"}.
Melhor gancho (thumb-stop): ${cr.topGancho?.name ?? "n/d"}. Melhor CTR: ${cr.topCtr?.name ?? "n/d"}. Mais compras: ${cr.topCompras?.name ?? "n/d"} (${cr.topCompras?.purchases ?? 0} compras). Melhor ROAS: ${cr.topRoas?.name ?? "n/d"} (ROAS ${cr.topRoas?.roas.toFixed(2) ?? "0"}).`
    : "sem dados de criativos";

  const pb = data.planBaseline.success ? data.planBaseline.baseline : null;
  const planText = data.plan
    ? `Meta definida pelo usuário: investimento mensal R$${data.plan.investimentoMensal.toFixed(2)}, meta de receita ${data.plan.metaReceita != null ? `R$${data.plan.metaReceita.toFixed(2)}` : "não definida"}, ticket médio alvo R$${data.plan.ticketMedio.toFixed(2)}, taxa de conversão alvo ${(data.plan.taxaConversao * 100).toFixed(2)}%.${pb ? ` Baseline real dos últimos 30 dias: CPS R$${pb.cps.toFixed(2)}, CVR ${(pb.cvr * 100).toFixed(2)}%, ticket R$${pb.ticket.toFixed(2)}, CPA R$${pb.cpa.toFixed(2)}, ROAS ${pb.roas.toFixed(2)}.` : ""}`
    : "sem planejamento definido pelo usuário ainda";

  return `Você é um especialista sênior em tráfego pago (Meta Ads/Facebook Ads), com profundo conhecimento de otimização de campanhas, criativos e alocação de verba. Analise TODA a conta de anúncios no período "${data.datePreset}" com base SOMENTE nos dados reais abaixo — nunca invente números. Faça uma análise DETALHADA E AMPLA, cruzando as 5 frentes (visão geral/campanhas, horários, anúncios individuais, criativos e planejamento).

RESUMO DA CONTA:
${s ? `Gasto R$${s.spend.toFixed(2)}, receita R$${s.revenue.toFixed(2)}, ROAS ${s.roas.toFixed(2)}, ${s.purchases} compras, CVR ${(s.cvr * 100).toFixed(2)}%, ticket médio R$${s.ticket.toFixed(2)}, CPA R$${s.cpa.toFixed(2)}, ${s.linkClicks} cliques no link, ${s.impressions} impressões.` : "conta não conectada ou sem dados nesse período"}

CAMPANHAS (Gestão) — até 8 maiores por gasto:
${campaignsText}

DAYPARTING (horários):
${daypartingText}

AD PULSE (nível de anúncio):
${pulseText}

INSIGHTS CRIATIVOS:
${creativesText}

PLANEJAMENTO:
${planText}

Com base em TUDO isso, escreva:
1. "resumo" (3-5 frases): visão geral do desempenho da conta nesse período, cruzando os pontos mais importantes das 5 frentes acima.
2. "insights" (4-8 itens): cada um com "title" curto, "text" (1-2 frases citando números reais) e "tone" ("positivo" se for um ponto forte, "atencao" se merece observação, "critico" se é um problema sério — ex: verba parada em horário sem retorno, anúncio queimando dinheiro sem venda, criativo fadigado carregando a verba, ROAS abaixo da meta do planejamento). Cubra pelo menos: desempenho geral, dayparting, ad pulse (desperdício/upside) e criativos (frescor/gancho).
3. "recomendacoes" (3-6 itens, ação concreta e específica — cite nomes reais de campanha/anúncio/criativo/horário quando fizer sentido, não genéricas).

Nunca invente números que não constem nos dados acima. Responda em português do Brasil.

Responda em JSON estrito:
{ "resumo": string, "insights": [ { "title": string, "text": string, "tone": "positivo"|"atencao"|"critico" } ], "recomendacoes": [string] }`;
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
        { role: "system", content: "Você é um especialista sênior em Meta Ads/tráfego pago. Responda sempre em JSON válido, nunca invente números." },
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

  return aiAnalysisSchema.parse(JSON.parse(content));
}

export const getLatestMetaAdsAnalysis = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("store_settings")
    .select("meta_ads_latest_analysis, meta_ads_latest_analysis_at, meta_ads_latest_analysis_period, openai_api_key")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    analysis: (data as any)?.meta_ads_latest_analysis ?? null,
    generatedAt: (data as any)?.meta_ads_latest_analysis_at ?? null,
    period: (data as any)?.meta_ads_latest_analysis_period ?? null,
    hasApiKey: Boolean((data as any)?.openai_api_key),
  };
});

export const generateMetaAdsAnalysis = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ datePreset: datePresetSchema }).parse(data))
  .handler(async ({ data: { datePreset } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: settings } = await supabaseAdmin
      .from("store_settings")
      .select("id, openai_api_key")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!(settings as any)?.openai_api_key) {
      return { success: false as const, error: "Nenhuma API key da OpenAI configurada em Configurações." };
    }

    const {
      getMetaAdsSummary,
      getMetaAdsRows,
      getMetaAdsDayparting,
      getMetaAdsPulse,
      getMetaAdsCreatives,
      getMetaAdsPlanningBaseline,
      getMetaAdsPlan,
    } = await import("./meta-ads.server");

    const [summary, campaigns, dayparting, pulse, creatives, planBaseline, plan] = await Promise.all([
      getMetaAdsSummary(datePreset),
      getMetaAdsRows("campaign", datePreset),
      getMetaAdsDayparting(datePreset),
      getMetaAdsPulse(datePreset),
      getMetaAdsCreatives(datePreset),
      getMetaAdsPlanningBaseline(),
      getMetaAdsPlan(),
    ]);

    if (!summary.success) {
      return { success: false as const, error: summary.error };
    }

    const prompt = buildPrompt({ datePreset, summary, campaigns, dayparting, pulse, creatives, planBaseline, plan });

    let analysis: z.infer<typeof aiAnalysisSchema>;
    try {
      analysis = await callOpenAi((settings as any).openai_api_key, prompt);
    } catch (err) {
      return { success: false as const, error: err instanceof Error ? err.message : "Falha ao chamar a OpenAI." };
    }

    const generatedAt = new Date().toISOString();
    const { error: saveError } = await supabaseAdmin
      .from("store_settings")
      .update({
        meta_ads_latest_analysis: analysis,
        meta_ads_latest_analysis_at: generatedAt,
        meta_ads_latest_analysis_period: datePreset,
        updated_at: generatedAt,
      } as never)
      .eq("id", (settings as any).id);

    if (saveError) {
      return { success: false as const, error: `Análise gerada, mas falhou ao salvar: ${saveError.message}` };
    }

    return { success: true as const, analysis, generatedAt };
  });
