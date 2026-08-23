import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const categoryEnum = z.enum(["preco", "campanha", "criativo", "estoque", "feriado", "concorrencia", "conteudo", "outro"]);

const rangeSchema = z.object({ from: z.string(), to: z.string() });

const eventInput = z.object({
  eventDate: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  category: categoryEnum,
  canais: z.array(z.string()).default([]),
});

export const listCrmEvents = createServerFn({ method: "POST" })
  .validator((data: unknown) => rangeSchema.parse(data))
  .handler(async ({ data }) => {
    const { listEvents } = await import("./events.server");
    return listEvents(data);
  });

export const createCrmEvent = createServerFn({ method: "POST" })
  .validator((data: unknown) => eventInput.parse(data))
  .handler(async ({ data }) => {
    const { createEvent } = await import("./events.server");
    return createEvent(data);
  });

export const updateCrmEvent = createServerFn({ method: "POST" })
  .validator((data: unknown) => eventInput.extend({ id: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { updateEvent } = await import("./events.server");
    return updateEvent(data);
  });

export const deleteCrmEvent = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { deleteEvent } = await import("./events.server");
    return deleteEvent(data.id);
  });

export const getEventsTimelineData = createServerFn({ method: "POST" })
  .validator((data: unknown) => rangeSchema.parse(data))
  .handler(async ({ data }) => {
    const { getEventsTimeline } = await import("./events.server");
    return getEventsTimeline(data);
  });

export const getCalendarMonthDataFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ year: z.number().int(), month: z.number().int().min(1).max(12) }).parse(data))
  .handler(async ({ data }) => {
    const { getCalendarMonthData } = await import("./events.server");
    return getCalendarMonthData(data.year, data.month);
  });

const eventsAnalysisSchema = z.object({
  resumo: z.string(),
  insights: z.array(
    z.object({
      title: z.string(),
      text: z.string(),
      tone: z.enum(["positivo", "atencao", "critico"]),
    }),
  ),
  recomendacoes: z.array(z.string()),
});

function buildPrompt(days: Array<{ date: string; faturamento: number; pedidos: number; metaSpend: number | null; metaRoas: number | null }>, events: Array<{ eventDate: string; title: string; category: string; description: string | null }>) {
  return `Você é um analista de e-commerce. Abaixo está a série diária de faturamento/pedidos (Shopify) e, quando disponível, gasto/ROAS (Meta Ads), além dos eventos que a equipe registrou manualmente no período (mudança de preço, campanha, criativo, estoque, feriado, concorrência).

SÉRIE DIÁRIA:
${days.map((d) => `${d.date}: faturamento R$${d.faturamento.toFixed(2)}, ${d.pedidos} pedidos${d.metaSpend != null ? `, gasto Meta R$${d.metaSpend.toFixed(2)}, ROAS ${d.metaRoas?.toFixed(2) ?? "-"}` : ""}`).join("\n")}

EVENTOS REGISTRADOS:
${events.length ? events.map((e) => `${e.eventDate} [${e.category}] ${e.title}${e.description ? " — " + e.description : ""}`).join("\n") : "(nenhum evento registrado neste período)"}

Cruze os eventos com as variações reais na série (picos e quedas de faturamento/ROAS) e explique o PORQUÊ do resultado, não apenas o que aconteceu. Se um evento coincide temporalmente com uma mudança visível nos números, aponte isso explicitamente. Se não houver eventos suficientes pra explicar uma variação notável, diga isso claramente (não invente causas). Nunca invente números que não constem nos dados acima. Responda em português do Brasil.

Responda em JSON estrito:
{
  "resumo": string (2-3 frases, visão geral do período),
  "insights": [ { "title": string, "text": string, "tone": "positivo"|"atencao"|"critico" } ] (3 a 6 itens),
  "recomendacoes": [ string ] (2 a 4 itens, ações concretas)
}`;
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
        { role: "system", content: "Você é um analista de e-commerce sênior, especialista em cruzar eventos de negócio com variações de métricas. Responda sempre em JSON válido." },
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
  return eventsAnalysisSchema.parse(JSON.parse(content));
}

export const getLatestEventsAnalysis = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("store_settings")
    .select("events_latest_analysis, events_latest_analysis_at, events_latest_analysis_range, openai_api_key")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    analysis: (data as any)?.events_latest_analysis ?? null,
    generatedAt: (data as any)?.events_latest_analysis_at ?? null,
    range: (data as any)?.events_latest_analysis_range ?? null,
    hasApiKey: Boolean((data as any)?.openai_api_key),
  };
});

export const generateEventsAnalysis = createServerFn({ method: "POST" })
  .validator((data: unknown) => rangeSchema.parse(data))
  .handler(async ({ data: range }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getEventsTimeline } = await import("./events.server");

    const { data: settings } = await supabaseAdmin
      .from("store_settings")
      .select("id, openai_api_key")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!(settings as any)?.openai_api_key) {
      return { success: false as const, error: "Nenhuma API key da OpenAI configurada em Configurações." };
    }

    const { days, events } = await getEventsTimeline(range);
    const prompt = buildPrompt(days, events);

    let analysis: z.infer<typeof eventsAnalysisSchema>;
    try {
      analysis = await callOpenAi((settings as any).openai_api_key, prompt);
    } catch (err) {
      return { success: false as const, error: err instanceof Error ? err.message : "Falha ao chamar a OpenAI." };
    }

    const generatedAt = new Date().toISOString();
    const { error: saveError } = await supabaseAdmin
      .from("store_settings")
      .update({
        events_latest_analysis: analysis,
        events_latest_analysis_at: generatedAt,
        events_latest_analysis_range: range,
        updated_at: generatedAt,
      } as never)
      .eq("id", (settings as any).id);

    if (saveError) {
      return { success: false as const, error: `Análise gerada, mas falhou ao salvar: ${saveError.message}` };
    }

    return { success: true as const, analysis, generatedAt };
  });
