import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { z } from "zod";

import { computeShopifyDashboardData } from "./shopify-dashboard.functions";
import { GOALS, SEGMENT_TYPES } from "./crm-mock";

const periodInput = z.object({
  period: z.enum(["diario", "semanal", "mensal", "anual", "tudo", "personalizado"]),
  range: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
  }).optional(),
});

const aiInsightSchema = z.object({
  title: z.string(),
  highlight: z.string().optional(),
  tone: z.enum(["critico", "regular", "meta", "info"]),
  text: z.string(),
});

const aiReguaSchema = z.object({
  titulo: z.string(),
  tag: z.string(),
  descricao: z.string(),
  base: z.string(),
  conv: z.string(),
  receita: z.number(),
});

const aiAcaoSchema = z.object({
  cluster: z.string(),
  criterio: z.string(),
  base: z.string(),
  oferta: z.string(),
  janela: z.string(),
  conv: z.string(),
  receita: z.number(),
  segmentType: z.enum(SEGMENT_TYPES),
});

const statusEnum = z.enum(["critico", "regular", "meta"]);

const aiPanelStatusSchema = z.object({
  recompra: statusEnum,
  clv: statusEnum,
  ticketRecorrencia: statusEnum,
  faixaTicket: statusEnum,
  regioes: statusEnum,
  churn: statusEnum,
  tempoEntreCompras: statusEnum,
  curvaRecompra: statusEnum,
  envios: statusEnum,
});

const aiAnalysisSchema = z.object({
  insights: z.array(aiInsightSchema).min(1).max(8),
  reguas: z.array(aiReguaSchema).max(6).default([]),
  acoes: z.array(aiAcaoSchema).max(8).default([]),
  panelStatus: aiPanelStatusSchema,
});

function buildPrompt(metrics: Awaited<ReturnType<typeof computeShopifyDashboardData>>) {
  return `Você é um analista de CRM para e-commerce. Analise os dados reais abaixo (extraídos agora da Shopify) e devolva um diagnóstico estratégico.

REGRA DOS DADOS: todos os números abaixo consideram APENAS pedidos pagos (PAID/PARTIALLY_PAID) e não cancelados. Reembolsados, expirados, cancelados e pendentes já foram excluídos. Não relativize os valores nem sugira que incluem vendas canceladas.
MATURIDADE DA BASE: ${metrics.historyDays} dias de histórico pago${metrics.baseMadura ? "" : " (menos de 90 dias — trate retenção, churn e curva de recompra como PRELIMINARES e não afirme churn definitivo)"}.
AMOSTRA MÍNIMA: só comente percentuais cujo denominador esteja acima de ${metrics.minSample} registros; caso contrário, diga explicitamente que a amostra é insuficiente.

DADOS DO PERÍODO:
- Faturamento válido: R$ ${metrics.faturamento.toFixed(2)}
- Pedidos pagos: ${metrics.numPedidos}
- Ticket médio: R$ ${metrics.ticketMedio.toFixed(2)}
- Clientes únicos: ${metrics.uniqueCustomers}
- Taxa de recompra (base total): ${metrics.taxaRecompra.toFixed(2)}%
- Pedidos enviados (com rastreio): ${metrics.pedidosEnviadosCount}
- Produtos enviados: ${metrics.produtosEnviadosCount}
- Tempo médio de envio: ${metrics.tempoMedioEnvioDias.toFixed(2)} dias (amostra: ${metrics.tempoMedioEnvioAmostra} pedidos)
- Frequência de compra: ${JSON.stringify(metrics.frequencia)}
- Valor acumulado observado por frequência (não é LTV previsto): ${JSON.stringify(metrics.clv)}
- Ticket x recorrência: ${JSON.stringify(metrics.ticketRecorrencia)}
- Faixas de ticket: ${JSON.stringify(metrics.faixaTicket)}
- Retenção por estágio (% que avançou para a compra seguinte): ${JSON.stringify(metrics.churn)}
- Tempo entre 1ª e 2ª compra (faixas exclusivas): ${JSON.stringify(metrics.tempoEntreCompras)}
- Quando acontece a 2ª compra (faixas exclusivas): ${JSON.stringify(metrics.curvaRecompra)}
- Taxa de recompra por estado (mín. ${metrics.minSample} clientes por estado): ${JSON.stringify(metrics.regioes)}
- Envios por dia da semana: ${JSON.stringify(metrics.enviosPorDia)}

METAS DO SEMÁFORO (pra você classificar o "tone" de cada insight):
- Taxa de recompra: tone "meta" se >= ${GOALS.taxaRecompra.meta}%, "regular" se >= ${GOALS.taxaRecompra.regular}%, senão "critico".
- Tempo médio de envio (menor é melhor): tone "meta" se <= ${GOALS.tempoMedioEnvio.meta} dias, "regular" se <= ${GOALS.tempoMedioEnvio.regular} dias, senão "critico".
- Ticket médio: tone "meta" se >= R$${GOALS.ticketMedio.meta}, "regular" se >= R$${GOALS.ticketMedio.regular}, senão "critico".
- Para insights sem meta numérica definida, use "info" (neutro) ou julgue "regular"/"critico" pela gravidade do padrão encontrado.

Além dos insights, classifique também o status ("critico" | "regular" | "meta") de cada um dos 9 painéis do dashboard, com base no padrão real dos dados acima (use seu julgamento de especialista em e-commerce quando não houver meta numérica explícita — ex: concentração excessiva em 1 única compra é crítico, retenção abaixo de 5% da 1ª para a 2ª compra é crítico, CLV bem distribuído entre faixas é meta, etc.):
- "recompra": distribuição de frequência de recompra (campo frequencia).
- "clv": distribuição do valor acumulado por estágio (campo clv).
- "ticketRecorrencia": evolução do ticket médio conforme o cliente recompra (campo ticketRecorrencia, some no futuro).
- "faixaTicket": concentração da base por faixa de ticket (campo faixaTicket).
- "regioes": taxa de recompra por estado (campo regioes).
- "churn": retenção por estágio de compra (campo churn; valores ALTOS são bons).
- "tempoEntreCompras": intervalo entre 1ª e 2ª compra (campo tempoEntreCompras).
- "curvaRecompra": em quantas semanas a 2ª compra acontece (campo curvaRecompra).
- "envios": tempo médio de envio, usando as mesmas metas do tempo médio de envio acima.

Cada AÇÃO PONTUAL da lista "acoes" é executada de verdade pelo sistema — ao clicar em "Aplicar ação" o
backend dispara uma mensagem de WhatsApp (API oficial da Meta) pra todo cliente real que bate com o
segmento. Por isso, todo "segmentType" tem que ser EXATAMENTE um destes 5 valores (não invente outros,
não repita o mesmo valor duas vezes na lista de ações):
- "ticket_alto": clientes com ticket médio (histórico completo) acima de R$${GOALS.ticketMedio.regular}.
- "sem_recompra": clientes que compraram só 1 vez, há 14 dias ou mais, e nunca voltaram.
- "recompra_30d": clientes que compraram só 1 vez, nos últimos 30 dias.
- "recompra_60d": clientes que compraram só 1 vez, entre 31 e 60 dias atrás.
- "envio_atrasado": clientes com pedido enviado nos últimos 30 dias que demorou mais que a meta (${GOALS.tempoMedioEnvio.regular} dias) entre pagamento e rastreio.

Responda em JSON estrito com este formato exato (nada de texto fora do JSON):
{
  "insights": [ { "title": string, "highlight": string opcional (ex: "50,00%"), "tone": "critico"|"regular"|"meta"|"info", "text": string (1 frase, o porquê) } ],
  "reguas": [ { "titulo": string, "tag": string, "descricao": string, "base": string (ex: "31%"), "conv": string (ex: "9,5%"), "receita": number (R$ estimado) } ],
  "acoes": [ { "cluster": string, "criterio": string, "base": string, "oferta": string, "janela": string (ex: "48h"), "conv": string, "receita": number, "segmentType": "ticket_alto"|"sem_recompra"|"recompra_30d"|"recompra_60d"|"envio_atrasado" } ],
  "panelStatus": { "recompra": "critico"|"regular"|"meta", "clv": "critico"|"regular"|"meta", "ticketRecorrencia": "critico"|"regular"|"meta", "faixaTicket": "critico"|"regular"|"meta", "regioes": "critico"|"regular"|"meta", "churn": "critico"|"regular"|"meta", "tempoEntreCompras": "critico"|"regular"|"meta", "curvaRecompra": "critico"|"regular"|"meta", "envios": "critico"|"regular"|"meta" }
}

Gere de 4 a 6 insights cobrindo recompra, ticket/recorrência, churn e tempo de envio. Gere de 2 a 4 réguas (fluxos automáticos recorrentes) e até 5 ações pontuais — no máximo 1 ação por segmentType, só inclua os segmentos que fizerem sentido pros dados reais acima. Nunca invente números que não constem nos dados. Escreva em português do Brasil.`;
}

async function callOpenAi(apiKey: string, prompt: string) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Você é um analista de CRM sênior para e-commerce, especialista em RFM, LTV e operação de envio. Responda sempre em JSON válido." },
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

/** Última análise gerada por IA (cache) — usada no carregamento normal da página. */
export const getLatestAiAnalysis = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("store_settings")
    .select("latest_ai_analysis, latest_ai_analysis_at, latest_ai_analysis_period, openai_api_key")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    analysis: (data?.latest_ai_analysis as z.infer<typeof aiAnalysisSchema> | null) ?? null,
    generatedAt: data?.latest_ai_analysis_at ?? null,
    period: data?.latest_ai_analysis_period ?? null,
    hasApiKey: Boolean(data?.openai_api_key),
  };
});

/** Botão "Refazer análise": busca os dados reais do período e pede pro ChatGPT analisar. */
export const generateAiAnalysis = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => periodInput.parse(data))
  .handler(async ({ data: { period, range } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: settings } = await supabaseAdmin
      .from("store_settings")
      .select("id, openai_api_key")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!settings?.openai_api_key) {
      return { success: false as const, error: "Nenhuma API key da OpenAI configurada em Configurações." };
    }

    const metrics = await computeShopifyDashboardData({ period, range });
    const prompt = buildPrompt(metrics);

    let analysis: z.infer<typeof aiAnalysisSchema>;
    try {
      analysis = await callOpenAi(settings.openai_api_key, prompt);
    } catch (err) {
      return {
        success: false as const,
        error: err instanceof Error ? err.message : "Falha ao chamar a OpenAI.",
      };
    }

    const generatedAt = new Date().toISOString();
    const { error: saveError } = await supabaseAdmin
      .from("store_settings")
      .update({
        latest_ai_analysis: analysis,
        latest_ai_analysis_at: generatedAt,
        latest_ai_analysis_period: period,
        updated_at: generatedAt,
      })
      .eq("id", settings.id);

    if (saveError) {
      return { success: false as const, error: `Análise gerada, mas falhou ao salvar: ${saveError.message}` };
    }

    return { success: true as const, analysis, generatedAt };
  });

const saveKeySchema = z.object({ apiKey: z.string().min(20) });

/** Salva a API key da OpenAI — nunca é devolvida ao cliente depois de salva. */
export const saveOpenAiApiKey = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => saveKeySchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("store_settings")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!existing) {
      return { success: false as const, error: "Configure primeiro a conexão com o Shopify em Configurações." };
    }

    const { error } = await supabaseAdmin
      .from("store_settings")
      .update({ openai_api_key: data.apiKey.trim(), updated_at: new Date().toISOString() })
      .eq("id", existing.id);

    if (error) return { success: false as const, error: error.message };
    return { success: true as const };
  });
