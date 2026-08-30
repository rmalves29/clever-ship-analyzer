import { addDays, addMonths } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

const TZ = "America/Sao_Paulo";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type AiRoutineDraft = {
  contentText: string;
  contentImageUrl: string | null;
  sourceSummary: string;
};

type DraftContext = {
  topAd: { name: string; thumbnailUrl: string | null; roas: number; ctrLink: number; cpa: number } | null;
  topPost: { caption: string | null; thumbnailUrl: string | null; reach: number; totalInteractions: number } | null;
};

type OpenAiDraftResult = {
  message_text: string;
  use_image: "ad" | "post" | "generate" | "none";
  image_prompt: string | null;
  source_summary: string;
};

function buildDraftPrompt(ctx: DraftContext): string {
  return `Você é um copywriter de e-commerce especialista em mensagens curtas pra grupos de WhatsApp (moda feminina, loja "Mania de Mulher"). Com base no MELHOR anúncio (por ROAS) e no MELHOR post do Instagram (por engajamento) abaixo, escreva UMA mensagem pronta pra disparar num grupo de WhatsApp — direta, com emoji com moderação, e um CTA claro (ex: "responde aqui" ou "corre no link"). Máximo 4 linhas.

ANÚNCIO COM MELHOR ROAS:
${ctx.topAd ? `"${ctx.topAd.name}" — ROAS ${ctx.topAd.roas.toFixed(2)}, CTR ${(ctx.topAd.ctrLink * 100).toFixed(2)}%, CPA R$${ctx.topAd.cpa.toFixed(2)}${ctx.topAd.thumbnailUrl ? " (imagem em anexo)" : " (sem imagem disponível)"}` : "nenhum anúncio disponível no período"}

POST COM MAIS ENGAJAMENTO NO INSTAGRAM:
${ctx.topPost ? `"${ctx.topPost.caption ?? "(sem legenda)"}" — alcance ${ctx.topPost.reach}, ${ctx.topPost.totalInteractions} interações${ctx.topPost.thumbnailUrl ? " (imagem em anexo)" : " (sem imagem disponível)"}` : "nenhum post disponível no período"}

Decida também qual imagem usar: a do anúncio, a do post, gerar uma nova (só se nenhuma das duas servir bem pra WhatsApp — ex: formato ruim, sem imagem, ou você tiver uma ideia bem melhor), ou nenhuma (mensagem só texto). Se decidir gerar, escreva um prompt em inglês pra um gerador de imagem (estilo foto de produto de moda feminina, cores vibrantes, sem texto sobreposto).

Responda em JSON estrito:
{ "message_text": string, "use_image": "ad"|"post"|"generate"|"none", "image_prompt": string|null, "source_summary": string (1 frase curta explicando em que você se baseou, pra mostrar num popup de aprovação) }`;
}

/** URLs de imagem do Meta (Ads/Instagram) costumam ser protegidas/temporárias — a OpenAI não
 *  consegue baixá-las direto (403). Baixamos aqui no servidor e mandamos como data URI.
 *  Exportado: reaproveitado por ai-content-queue.server.ts pra geração em lote. */
export async function fetchImageAsDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const buf = await res.arrayBuffer();
    const base64 = Buffer.from(buf).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch (error) {
    console.error(`fetchImageAsDataUri: falha ao baixar ${url}:`, error);
    return null;
  }
}

export function dataUriToBase64(dataUri: string): string {
  return dataUri.slice(dataUri.indexOf(",") + 1);
}

export function dataUriContentType(dataUri: string): string {
  const match = /^data:([^;]+);base64,/.exec(dataUri);
  return match?.[1] ?? "image/jpeg";
}

async function callOpenAiDraft(apiKey: string, ctx: DraftContext): Promise<{ result: OpenAiDraftResult; adDataUri: string | null; postDataUri: string | null }> {
  const [adDataUri, postDataUri] = await Promise.all([
    ctx.topAd?.thumbnailUrl ? fetchImageAsDataUri(ctx.topAd.thumbnailUrl) : Promise.resolve(null),
    ctx.topPost?.thumbnailUrl ? fetchImageAsDataUri(ctx.topPost.thumbnailUrl) : Promise.resolve(null),
  ]);
  const imageParts: Array<{ type: "image_url"; image_url: { url: string } }> = [];
  if (adDataUri) imageParts.push({ type: "image_url", image_url: { url: adDataUri } });
  if (postDataUri) imageParts.push({ type: "image_url", image_url: { url: postDataUri } });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Você é um copywriter de e-commerce sênior. Responda sempre em JSON válido." },
        {
          role: "user",
          content: [{ type: "text", text: buildDraftPrompt(ctx) }, ...imageParts],
        },
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
  return { result: JSON.parse(content) as OpenAiDraftResult, adDataUri, postDataUri };
}

export async function generateImageBase64(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1024x1024", n: 1 }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`OpenAI (imagem) respondeu ${res.status}: ${errBody.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI não retornou imagem.");
  return b64;
}

export async function generateAiRoutineDraft(): Promise<{ success: true; draft: AiRoutineDraft } | { success: false; error: string }> {
  const supabaseAdmin = await admin();
  const { data: settings } = await supabaseAdmin.from("store_settings").select("openai_api_key").order("created_at", { ascending: true }).limit(1).maybeSingle();
  const apiKey = (settings as any)?.openai_api_key as string | undefined;
  if (!apiKey) return { success: false, error: "Configure a API key da OpenAI em Configurações antes de usar isso." };

  const { getMetaAdsCreatives } = await import("./meta-ads.server");
  const { getInstagramTopContent } = await import("./instagram.server");

  const [adsRes, igRes] = await Promise.all([
    getMetaAdsCreatives("last_30d").catch(() => ({ success: false as const, error: "" })),
    getInstagramTopContent("last_30d").catch(() => ({ success: false as const, error: "" })),
  ]);

  const topAd = adsRes.success && adsRes.result.topRoas
    ? {
        name: adsRes.result.topRoas.name,
        thumbnailUrl: adsRes.result.topRoas.thumbnailUrl,
        roas: adsRes.result.topRoas.roas,
        ctrLink: adsRes.result.topRoas.ctrLink,
        cpa: adsRes.result.topRoas.cpa,
      }
    : null;

  const topPost = igRes.success && igRes.media.length > 0
    ? [...igRes.media].sort((a, b) => b.totalInteractions - a.totalInteractions).slice(0, 1).map((m) => ({
        caption: m.caption,
        thumbnailUrl: m.thumbnailUrl,
        reach: m.reach,
        totalInteractions: m.totalInteractions,
      }))[0]!
    : null;

  if (!topAd && !topPost) {
    return { success: false, error: "Nenhum anúncio (Meta Ads) ou post (Instagram) disponível nos últimos 30 dias pra basear a mensagem. Conecte pelo menos um em Configurações." };
  }

  let draftResult: { result: OpenAiDraftResult; adDataUri: string | null; postDataUri: string | null };
  try {
    draftResult = await callOpenAiDraft(apiKey, { topAd, topPost });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao gerar o rascunho com a OpenAI." };
  }
  const { result } = draftResult;

  // Sempre rehospeda no nosso storage — a URL original do Meta é protegida/temporária e não
  // funcionaria nem pra mostrar no popup nem pro UazAPI buscar na hora de enviar.
  const { uploadEnvioMedia } = await import("./envio-messages.server");

  let contentImageUrl: string | null = null;
  try {
    if (result.use_image === "ad" && draftResult.adDataUri) {
      contentImageUrl = (await uploadEnvioMedia({ fileName: `ai-routine-${Date.now()}.jpg`, base64Data: dataUriToBase64(draftResult.adDataUri), contentType: dataUriContentType(draftResult.adDataUri) })).url;
    } else if (result.use_image === "post" && draftResult.postDataUri) {
      contentImageUrl = (await uploadEnvioMedia({ fileName: `ai-routine-${Date.now()}.jpg`, base64Data: dataUriToBase64(draftResult.postDataUri), contentType: dataUriContentType(draftResult.postDataUri) })).url;
    } else if (result.use_image === "generate" && result.image_prompt) {
      const b64 = await generateImageBase64(apiKey, result.image_prompt);
      contentImageUrl = (await uploadEnvioMedia({ fileName: `ai-routine-${Date.now()}.png`, base64Data: b64, contentType: "image/png" })).url;
    }
  } catch (error) {
    console.error("generateAiRoutineDraft: falha ao preparar imagem, seguindo sem imagem:", error);
  }

  return {
    success: true,
    draft: { contentText: result.message_text, contentImageUrl, sourceSummary: result.source_summary },
  };
}

export type RoutineRecurrence = "once" | "daily" | "weekly" | "monthly";

function computeInitialNextRunAt(input: { recurrence: RoutineRecurrence; dayOfWeek?: number | undefined; dayOfMonth?: number | undefined; timeOfDay: string }): Date {
  const [hh, mm] = input.timeOfDay.split(":").map(Number) as [number, number];
  const nowSP = toZonedTime(new Date(), TZ);

  if (input.recurrence === "once" || input.recurrence === "daily") {
    const candidate = new Date(nowSP);
    candidate.setHours(hh, mm, 0, 0);
    if (candidate <= nowSP) candidate.setDate(candidate.getDate() + 1);
    return fromZonedTime(candidate, TZ);
  }

  if (input.recurrence === "weekly") {
    const targetDow = input.dayOfWeek ?? 1;
    const candidate = new Date(nowSP);
    candidate.setHours(hh, mm, 0, 0);
    let diff = (targetDow - candidate.getDay() + 7) % 7;
    if (diff === 0 && candidate <= nowSP) diff = 7;
    candidate.setDate(candidate.getDate() + diff);
    return fromZonedTime(candidate, TZ);
  }

  // monthly
  const targetDom = Math.min(Math.max(input.dayOfMonth ?? 1, 1), 28);
  let candidate = new Date(nowSP.getFullYear(), nowSP.getMonth(), targetDom, hh, mm, 0, 0);
  if (candidate <= nowSP) candidate = new Date(nowSP.getFullYear(), nowSP.getMonth() + 1, targetDom, hh, mm, 0, 0);
  return fromZonedTime(candidate, TZ);
}

function advanceNextRunAt(recurrence: RoutineRecurrence, prevNextRunAt: string): Date {
  const prev = new Date(prevNextRunAt);
  if (recurrence === "weekly") return addDays(prev, 7);
  if (recurrence === "monthly") return addMonths(prev, 1);
  return addDays(prev, 1); // daily
}

/** Manda a mensagem pros grupos vinculados à campanha (live-launchpad-79) — imediatamente se
 *  `scheduledAtIso` for null/omitido (cai no envio em background do próprio createAndSendEnvioMessage),
 *  ou entra na fila de agendados do Fluxo de Envio (aba Envios, já tem cron próprio) se for uma
 *  data futura. Retorna quantos grupos foram alvo, pra o chamador decidir o que fazer se for 0. */
export async function dispatchToCampaignGroups(campaignId: string, contentText: string, contentImageUrl: string | null, scheduledAtIso?: string): Promise<{ groupCount: number; messageIds: string[] }> {
  const { resolveEnvioCampaignAudience } = await import("./envio-campaigns.server");
  const audience = await resolveEnvioCampaignAudience(campaignId);
  if (audience.groupCount === 0) return { groupCount: 0, messageIds: [] };

  const { createAndSendEnvioMessage } = await import("./envio-messages.server");
  const res = await createAndSendEnvioMessage({
    campaignId,
    groupIds: audience.groupIds,
    contentType: contentImageUrl ? "image" : "text",
    contentText,
    mediaUrl: contentImageUrl ?? undefined,
    scheduledAt: scheduledAtIso,
  });

  return { groupCount: audience.groupCount, messageIds: res.messageIds };
}

export async function createAiSendRoutine(input: {
  campaignId: string;
  campaignName: string;
  contentText: string;
  contentImageUrl: string | null;
  sourceSummary: string;
  recurrence: RoutineRecurrence;
  dayOfWeek?: number | undefined;
  dayOfMonth?: number | undefined;
  timeOfDay: string;
  sendNow?: boolean | undefined;
}): Promise<{ success: true; id: string; sentImmediately: boolean; groupCount: number } | { success: false; error: string }> {
  const supabaseAdmin = await admin();
  const firstRunAt = input.sendNow ? new Date() : computeInitialNextRunAt(input);

  // Menos de 1min de diferença conta como "agora" — evita empurrar pro processador de agendados
  // do Fluxo de Envio só por causa do arredondamento do relógio.
  const isImmediate = firstRunAt.getTime() - Date.now() <= 60_000;

  let dispatchResult: { groupCount: number };
  try {
    dispatchResult = await dispatchToCampaignGroups(
      input.campaignId,
      input.contentText,
      input.contentImageUrl,
      isImmediate ? undefined : firstRunAt.toISOString(),
    );
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao enviar/agendar a primeira mensagem." };
  }

  if (dispatchResult.groupCount === 0) {
    return { success: false, error: "Essa campanha não tem nenhum grupo vinculado. Vincule grupos em Fluxo de Envio → Campanhas antes de criar a rotina." };
  }

  // Recorrência única: a primeira (e única) ocorrência já foi despachada acima — não precisa de
  // linha ativa no cron de rotinas. Recorrente: a próxima ocorrência do cron é a de DEPOIS dessa
  // primeira, que já foi despachada — senão duplicaria o primeiro envio.
  const isRecurring = input.recurrence !== "once";
  const nextRunAt = isRecurring ? advanceNextRunAt(input.recurrence, firstRunAt.toISOString()) : firstRunAt;

  const { data, error } = await (supabaseAdmin.from("ai_send_routines" as any) as any)
    .insert({
      campaign_id: input.campaignId,
      campaign_name: input.campaignName,
      content_text: input.contentText,
      content_image_url: input.contentImageUrl,
      source_summary: input.sourceSummary,
      recurrence: input.recurrence,
      day_of_week: input.dayOfWeek ?? null,
      day_of_month: input.dayOfMonth ?? null,
      time_of_day: input.timeOfDay,
      next_run_at: nextRunAt.toISOString(),
      last_run_at: new Date().toISOString(),
      status: isRecurring ? "active" : "done",
    })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, id: (data as any).id, sentImmediately: isImmediate, groupCount: dispatchResult.groupCount };
}

/** Cron (a cada 15min): dispara as rotinas cujo next_run_at já passou, manda pros grupos vinculados
 *  à campanha (via envio_messages, que já tem seu próprio processador agendado) e reagenda a
 *  próxima ocorrência — ou marca 'done' se for recorrência única. */
export async function runAiRoutinesTick(): Promise<{ processed: number; failed: number; total: number }> {
  const supabaseAdmin = await admin();
  const { data: due } = await (supabaseAdmin.from("ai_send_routines" as any) as any)
    .select("*")
    .eq("status", "active")
    .lte("next_run_at", new Date().toISOString())
    .limit(20);

  const routines = (due ?? []) as any[];
  let processed = 0;
  let failed = 0;

  for (const routine of routines) {
    try {
      await fireRoutine(routine);
      processed++;
    } catch (error) {
      console.error(`runAiRoutinesTick: falha na rotina ${routine.id}:`, error);
      failed++;
    }
  }

  return { processed, failed, total: routines.length };
}

async function fireRoutine(routine: any): Promise<void> {
  const supabaseAdmin = await admin();

  // Chegou aqui porque next_run_at <= agora, então despacha sem scheduledAt (imediato) — o próprio
  // Fluxo de Envio processa na hora, sem precisar esperar o cron de agendados também.
  await dispatchToCampaignGroups(routine.campaign_id, routine.content_text, routine.content_image_url);

  const isRecurring = routine.recurrence !== "once";
  await (supabaseAdmin.from("ai_send_routines" as any) as any)
    .update({
      last_run_at: new Date().toISOString(),
      next_run_at: isRecurring ? advanceNextRunAt(routine.recurrence, routine.next_run_at).toISOString() : routine.next_run_at,
      status: isRecurring ? "active" : "done",
      updated_at: new Date().toISOString(),
    })
    .eq("id", routine.id);
}
