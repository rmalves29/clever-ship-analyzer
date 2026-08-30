import { z } from "zod";
import { fetchImageAsDataUri, dataUriToBase64, dataUriContentType, generateImageBase64, dispatchToCampaignGroups } from "./ai-send-routines.server";
import type { BestSellingProduct } from "./shopify-products.server";
import type { InstagramMedia } from "./instagram.server";
import { getCommercialDateName } from "./commercial-dates";
import {
  AI_CONTENT_PROMPT_VERSION,
  buildAiContentSystemPrompt,
  buildAiContentUserPrompt,
  pickAnglesForSources,
  scheduledAtInSaoPaulo,
  validateAiBatchSchedule,
  type AiBatchBriefing,
  type AiPromptItemPlan,
  type AiSourceKind,
} from "./ai-content-prompt";

const TZ = "America/Sao_Paulo";
const APP_BASE_URL = "https://clever-ship-analyzer.lovable.app";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type ContentQueueItem = {
  id: string;
  batchId: string;
  campaignId: string;
  campaignName: string;
  contentText: string;
  contentImageUrl: string | null;
  linkType: "instagram" | "site" | "none";
  linkUrl: string | null;
  sourceSummary: string;
  scheduledDate: string;
  timeOfDay: string;
  status: "review" | "processing" | "approved" | "scheduled" | "rejected" | "sent" | "failed";
  envioMessageId: string | null;
  envioMessageIds: string[];
  rejectionReason: string | null;
  lastError: string | null;
  promptVersion: string | null;
  generationModel: string | null;
  approvedAt: string | null;
  sentAt: string | null;
};

function mapRow(row: any): ContentQueueItem {
  return {
    id: row.id,
    batchId: row.batch_id,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    contentText: row.content_text,
    contentImageUrl: row.content_image_url,
    linkType: row.link_type ?? "none",
    linkUrl: row.link_url,
    sourceSummary: row.source_summary,
    scheduledDate: row.scheduled_date,
    timeOfDay: row.time_of_day,
    status: row.status,
    envioMessageId: row.envio_message_id,
    envioMessageIds: Array.isArray(row.envio_message_ids)
      ? row.envio_message_ids.filter((id: unknown): id is string => typeof id === "string")
      : row.envio_message_id
        ? [row.envio_message_id]
        : [],
    rejectionReason: row.rejection_reason ?? null,
    lastError: row.last_error ?? null,
    promptVersion: row.prompt_version ?? null,
    generationModel: row.generation_model ?? null,
    approvedAt: row.approved_at ?? null,
    sentAt: row.sent_at ?? null,
  };
}

type DraftItem = {
  index: number;
  message_text: string;
  facts_used: string[];
  risk_flags: string[];
  image_prompt: string | null;
};

type ProductSourceSlot = {
  kind: "top_seller_1" | "top_seller_2" | "top_visited";
  title: string;
  description: string | null;
  imageUrl: string | null;
  productUrl: string | null;
};

type InstagramSourceSlot = {
  kind: "top_post_1" | "top_post_2" | "top_reel";
  caption: string | null;
  imageUrl: string | null;
  permalink: string | null;
};

type CouponSourceSlot = {
  kind: "coupon";
  code: string;
  percentageLabel: string; // "8%"
  expiresAtLabel: string; // já formatado pt-BR/America-Sao_Paulo
};

type ContentSlot = ProductSourceSlot | InstagramSourceSlot | CouponSourceSlot | null;

type NonCouponSlotKind = "top_seller_1" | "top_seller_2" | "top_visited" | "top_post_1" | "top_post_2" | "top_reel";
type SlotKind = NonCouponSlotKind | "coupon";

function buildScheduledDates(startDate: string, count: number): string[] {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number) as [number, number, number];
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(startYear, startMonth - 1, startDay + i);
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return dates;
}

function isSunday(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d).getDay() === 0;
}

const NON_COUPON_KINDS: NonCouponSlotKind[] = ["top_seller_1", "top_seller_2", "top_visited", "top_post_1", "top_post_2", "top_reel"];

/** Domingo (sempre existe exatamente 1 numa janela de 7 dias corridos) sempre vira cupom. As
 *  outras datas recebem as 6 fontes reais em ordem embaralhada a cada geração — nunca a mesma
 *  sequência fixa toda semana. No modo "dia" (count=1, não-domingo) isso naturalmente sorteia 1
 *  das 6 fontes aleatoriamente, sem correspondência fixa dia-da-semana -> fonte. */
function assignSlotKinds(scheduledDates: string[]): SlotKind[] {
  const shuffled = [...NON_COUPON_KINDS].sort(() => Math.random() - 0.5);
  let ptr = 0;
  return scheduledDates.map((d) => {
    if (isSunday(d)) return "coupon";
    const kind = shuffled[ptr % shuffled.length]!;
    ptr++;
    return kind;
  });
}

function dateOnlyToSaoPauloISO(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00-03:00`).toISOString();
}

/** "Semana anterior" = 7 dias corridos antes de `startDate` (data de início do lote). */
function previousWeekRange(startDate: string): { sinceDate: string; untilDate: string; sinceISO: string; untilISO: string } {
  const [y, m, d] = startDate.split("-").map(Number) as [number, number, number];
  const fmt = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  const untilDate = fmt(new Date(y, m - 1, d));
  const sinceDate = fmt(new Date(y, m - 1, d - 7));
  return { sinceDate, untilDate, sinceISO: dateOnlyToSaoPauloISO(sinceDate), untilISO: dateOnlyToSaoPauloISO(untilDate) };
}

type WeeklySignals = {
  topSeller1: ProductSourceSlot | null;
  topSeller2: ProductSourceSlot | null;
  topVisited: ProductSourceSlot | null;
  topPost1: InstagramSourceSlot | null;
  topPost2: InstagramSourceSlot | null;
  topReel: InstagramSourceSlot | null;
};

/** Junta os sinais reais da semana anterior a `startDate`: 2 produtos mais vendidos, 1 produto
 *  mais acessado (nunca coincidindo com os 2 vendidos), 2 posts + 1 reels de mais engajamento do
 *  Instagram. Cada sub-busca tem fallback isolado — uma fonte falhando não derruba as outras. */
async function gatherWeeklySignals(startDate: string): Promise<WeeklySignals> {
  const { sinceDate, untilDate, sinceISO, untilISO } = previousWeekRange(startDate);

  const { getBestSellingProducts, getMostVisitedProducts } = await import("./shopify-products.server");
  const { getShopifyProductsByIds } = await import("./shopify.server");
  const { getInstagramTopContentInRange } = await import("./instagram.server");

  const [bestSellers, igRes] = await Promise.all([
    getBestSellingProducts({ startISO: sinceISO, endISO: untilISO, limit: 2 }).catch(() => [] as BestSellingProduct[]),
    getInstagramTopContentInRange(sinceISO, untilISO).catch(() => ({ success: false as const, error: "" })),
  ]);

  const bestSellerIds = bestSellers.map((p) => p.productId).filter((id): id is string => !!id);
  const [productDetails, mostVisited] = await Promise.all([
    getShopifyProductsByIds(bestSellerIds).catch(() => new Map()),
    getMostVisitedProducts({ sinceDate, untilDate, excludeProductIds: bestSellerIds, limit: 1 }).catch(() => []),
  ]);

  function toProductSlot(kind: "top_seller_1" | "top_seller_2", seller: BestSellingProduct | undefined): ProductSourceSlot | null {
    if (!seller) return null;
    const detail = seller.productId ? productDetails.get(seller.productId) : undefined;
    return {
      kind,
      title: detail?.title ?? seller.title,
      description: detail?.description ?? null,
      imageUrl: detail?.featuredImageUrl ?? null,
      productUrl: detail?.productUrl ?? null,
    };
  }

  const topSeller1 = toProductSlot("top_seller_1", bestSellers[0]);
  const topSeller2 = toProductSlot("top_seller_2", bestSellers[1]);
  const visited = mostVisited[0];
  const topVisited: ProductSourceSlot | null = visited
    ? { kind: "top_visited", title: visited.detail.title, description: visited.detail.description, imageUrl: visited.detail.featuredImageUrl, productUrl: visited.detail.productUrl }
    : null;

  const media = igRes.success ? igRes.media : [];
  const nonVideo = media.filter((m) => m.mediaType === "IMAGE" || m.mediaType === "CAROUSEL_ALBUM").sort((a, b) => b.totalInteractions - a.totalInteractions);
  const reels = media.filter((m) => m.mediaType === "VIDEO" || m.productType === "REELS").sort((a, b) => b.totalInteractions - a.totalInteractions);

  function toIgSlot(kind: "top_post_1" | "top_post_2" | "top_reel", m: InstagramMedia | undefined): InstagramSourceSlot | null {
    if (!m) return null;
    return { kind, caption: m.caption, imageUrl: m.thumbnailUrl, permalink: m.permalink };
  }

  return {
    topSeller1,
    topSeller2,
    topVisited,
    topPost1: toIgSlot("top_post_1", nonVideo[0]),
    topPost2: toIgSlot("top_post_2", nonVideo[1]),
    topReel: toIgSlot("top_reel", reels[0]),
  };
}

function slotForKind(kind: NonCouponSlotKind, signals: WeeklySignals): ContentSlot {
  switch (kind) {
    case "top_seller_1": return signals.topSeller1;
    case "top_seller_2": return signals.topSeller2;
    case "top_visited": return signals.topVisited;
    case "top_post_1": return signals.topPost1;
    case "top_post_2": return signals.topPost2;
    case "top_reel": return signals.topReel;
  }
}

function sourceKind(slot: ContentSlot): AiSourceKind {
  return slot?.kind ?? "none";
}

function sourceVerifiedFacts(slot: ContentSlot): string[] {
  if (!slot) return ["Nenhuma fonte comercial específica estava disponível; fale apenas da marca sem inventar produto ou oferta."];
  switch (slot.kind) {
    case "top_seller_1":
      return [
        `"${slot.title}" foi o produto mais vendido na semana anterior.`,
        ...(slot.description ? [`Descrição cadastrada: ${slot.description.slice(0, 300)}`] : []),
      ];
    case "top_seller_2":
      return [
        `"${slot.title}" foi o segundo produto mais vendido na semana anterior.`,
        ...(slot.description ? [`Descrição cadastrada: ${slot.description.slice(0, 300)}`] : []),
      ];
    case "top_visited":
      return [
        `"${slot.title}" foi o produto mais acessado no site na semana anterior entre os produtos elegíveis.`,
        ...(slot.description ? [`Descrição cadastrada: ${slot.description.slice(0, 300)}`] : []),
      ];
    case "top_post_1":
    case "top_post_2":
      return [
        "A publicação esteve entre os posts com mais interações na semana anterior.",
        ...(slot.caption ? [`Legenda original: ${slot.caption.slice(0, 500)}`] : []),
      ];
    case "top_reel":
      return [
        "O Reels foi o vídeo com mais interações na semana anterior.",
        ...(slot.caption ? [`Legenda original: ${slot.caption.slice(0, 500)}`] : []),
      ];
    case "coupon":
      return [
        `Código do cupom: ${slot.code}`,
        `Desconto: ${slot.percentageLabel} OFF`,
        `Validade: até ${slot.expiresAtLabel}`,
        "Benefício destinado aos grupos vinculados à campanha.",
      ];
  }
}

function sourceSummary(slot: ContentSlot): string {
  if (!slot) return "Marca em geral, sem fonte comercial específica.";
  switch (slot.kind) {
    case "top_seller_1": return `Produto mais vendido: ${slot.title}`;
    case "top_seller_2": return `Segundo produto mais vendido: ${slot.title}`;
    case "top_visited": return `Produto mais acessado: ${slot.title}`;
    case "top_post_1": return "Post #1 com mais interações no Instagram.";
    case "top_post_2": return "Post #2 com mais interações no Instagram.";
    case "top_reel": return "Reels com mais interações no Instagram.";
    case "coupon": return `Cupom ${slot.code}, ${slot.percentageLabel} OFF, válido até ${slot.expiresAtLabel}.`;
  }
}

function expectedLink(slot: ContentSlot): { type: "instagram" | "site" | "none"; url: string | null } {
  if (!slot || slot.kind === "coupon") return { type: "none", url: null };
  if (slot.kind === "top_post_1" || slot.kind === "top_post_2" || slot.kind === "top_reel") {
    return slot.permalink ? { type: "instagram", url: slot.permalink } : { type: "none", url: null };
  }
  return slot.productUrl ? { type: "site", url: slot.productUrl } : { type: "none", url: null };
}

function allowedCta(slot: ContentSlot): string {
  const link = expectedLink(slot);
  if (link.type === "instagram") return "Convidar a ver a publicação no Instagram.";
  if (link.type === "site") return "Convidar a ver o produto no site.";
  if (slot?.kind === "coupon") return "Convidar a usar o código dentro da validade.";
  return "Convidar a responder ou interagir no grupo.";
}

function weekdayLabel(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: TZ }).format(new Date(`${date}T12:00:00-03:00`));
}

async function loadCalendarContext(scheduledDates: string[]): Promise<Map<string, Array<{ title: string; description: string | null; category: string }>>> {
  const supabaseAdmin = await admin();
  const { data } = await (supabaseAdmin.from("crm_events" as any) as any)
    .select("event_date, title, description, category")
    .gte("event_date", scheduledDates[0]!)
    .lte("event_date", scheduledDates[scheduledDates.length - 1]!)
    .order("event_date", { ascending: true });
  const byDate = new Map<string, Array<{ title: string; description: string | null; category: string }>>();
  for (const event of (data ?? []) as any[]) {
    const date = String(event.event_date);
    const list = byDate.get(date) ?? [];
    list.push({ title: String(event.title), description: event.description ?? null, category: String(event.category) });
    byDate.set(date, list);
  }
  return byDate;
}

const draftItemSchema = z.object({
  index: z.number().int().positive(),
  message_text: z.string().trim().min(1).max(500).refine((text) => text.split(/\r?\n/).length <= 6, "Mensagem deve ter no máximo 6 linhas."),
  facts_used: z.array(z.string().trim().min(1).max(300)).max(12),
  risk_flags: z.array(z.string().trim().min(1).max(300)).max(8),
  image_prompt: z.string().trim().min(1).max(600).nullable(),
});

function parseDraftItems(content: string, count: number): DraftItem[] {
  const parsed = z.object({ items: z.array(draftItemSchema).length(count) }).parse(JSON.parse(content));
  const indexes = parsed.items.map((item) => item.index).sort((a, b) => a - b);
  const expected = Array.from({ length: count }, (_, index) => index + 1);
  if (indexes.some((value, index) => value !== expected[index])) {
    throw new Error("A IA não preservou os índices do plano de conteúdo.");
  }
  return parsed.items.sort((a, b) => a.index - b.index);
}

async function requestBatchCompletion(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  count: number,
  imageParts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>,
): Promise<DraftItem[]> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      max_tokens: count === 7 ? 3000 : 900,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: [{ type: "text", text: userPrompt }, ...imageParts] },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`OpenAI (${model}) respondeu ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; refusal?: string }; finish_reason?: string }>;
  };
  const choice = json.choices?.[0];
  const content = choice?.message?.content;
  if (!content) {
    const reason = choice?.message?.refusal ? `recusa: ${choice.message.refusal}` : `finish_reason: ${choice?.finish_reason ?? "desconhecido"}`;
    throw new Error(`OpenAI (${model}) não retornou conteúdo (${reason}).`);
  }
  return parseDraftItems(content, count);
}

const PREFERRED_MODEL = "gpt-4o";
const FALLBACK_MODEL = "gpt-4o-mini";

async function callOpenAiBatch(
  apiKey: string,
  slots: ContentSlot[],
  count: number,
  systemPrompt: string,
  userPrompt: string,
): Promise<{ items: DraftItem[]; slotImageDataUris: (string | null)[]; model: string }> {
  const slotImageDataUris = await Promise.all(
    slots.map((slot) => {
      if (!slot || slot.kind === "coupon") return Promise.resolve(null);
      return slot.imageUrl ? fetchImageAsDataUri(slot.imageUrl) : Promise.resolve(null);
    }),
  );

  const imageParts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
  slots.forEach((slot, index) => {
    const dataUri = slotImageDataUris[index];
    if (!dataUri || !slot || slot.kind === "coupon") return;
    imageParts.push({ type: "text", text: `Imagem real da mensagem ${index + 1} — ${sourceSummary(slot)}` });
    imageParts.push({ type: "image_url", image_url: { url: dataUri } });
  });

  try {
    const items = await requestBatchCompletion(apiKey, PREFERRED_MODEL, systemPrompt, userPrompt, count, imageParts);
    return { items, slotImageDataUris, model: PREFERRED_MODEL };
  } catch (preferredError) {
    console.error(`callOpenAiBatch: falha no modelo preferido (${PREFERRED_MODEL}), usando ${FALLBACK_MODEL}:`, preferredError);
    const items = await requestBatchCompletion(apiKey, FALLBACK_MODEL, systemPrompt, userPrompt, count, imageParts);
    return { items, slotImageDataUris, model: FALLBACK_MODEL };
  }
}



export type BatchMode = "day" | "week";
export type FunnelStage = "descoberta" | "consideracao" | "conversao" | "fidelizacao";

export async function generateAiContentBatch(input: {
  campaignId: string;
  mode: BatchMode;
  startDate: string;
  timeOfDay: string;
  brandName: string;
  brandVoice: string;
  audience: string;
  campaignObjective: string;
  funnelStage: FunnelStage;
  prohibitedClaims: string;
}): Promise<{ success: true; batchId: string; items: ContentQueueItem[] } | { success: false; error: string }> {
  const scheduleError = validateAiBatchSchedule(input.startDate, input.timeOfDay);
  if (scheduleError) return { success: false, error: scheduleError };

  const { resolveEnvioCampaignAudience } = await import("./envio-campaigns.server");
  let audienceContext;
  try {
    audienceContext = await resolveEnvioCampaignAudience(input.campaignId);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Campanha inválida." };
  }
  if (audienceContext.groupCount === 0) {
    return { success: false, error: "A campanha selecionada não possui grupos vinculados." };
  }

  const supabaseAdmin = await admin();
  const { data: settings } = await supabaseAdmin
    .from("store_settings")
    .select("openai_api_key, ai_marketing_playbook")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const apiKey = (settings as any)?.openai_api_key as string | undefined;
  if (!apiKey) return { success: false, error: "Configure a API key da OpenAI em Configurações antes de usar isso." };
  const playbook = (settings as any)?.ai_marketing_playbook as string | null;

  const { cleanupOrphanedAiCoupons } = await import("./ai-coupons.server");
  await cleanupOrphanedAiCoupons().catch((error) => console.error("Falha ao limpar cupons órfãos:", error));

  const count = input.mode === "week" ? 7 : 1;
  const scheduledDates = buildScheduledDates(input.startDate, count);
  const kinds = assignSlotKinds(scheduledDates);
  const batchId = crypto.randomUUID();
  const signals = await gatherWeeklySignals(input.startDate);

  const hasAnySignal = Boolean(signals.topSeller1 || signals.topSeller2 || signals.topVisited || signals.topPost1 || signals.topPost2 || signals.topReel);
  if (!hasAnySignal && !kinds.includes("coupon")) {
    return { success: false, error: "Nenhum produto vendido, produto acessado ou conteúdo do Instagram estava disponível na semana anterior." };
  }

  const slots: ContentSlot[] = [];
  for (let index = 0; index < count; index++) {
    if (kinds[index] === "coupon") {
      const { prepareBatchCoupon } = await import("./ai-coupons.server");
      const prepared = await prepareBatchCoupon({ scheduledDate: scheduledDates[index]!, batchId });
      if (prepared.success) {
        const expiresAtLabel = new Date(prepared.coupon.endsAt).toLocaleString("pt-BR", {
          timeZone: TZ,
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
        slots.push({
          kind: "coupon",
          code: prepared.coupon.code,
          percentageLabel: `${Math.round(prepared.coupon.percentage * 100)}%`,
          expiresAtLabel,
        });
      } else {
        console.error(`Falha ao reservar cupom para ${scheduledDates[index]}: ${prepared.error}`);
        slots.push(NON_COUPON_KINDS.map((kind) => slotForKind(kind, signals)).find(Boolean) ?? null);
      }
    } else {
      slots.push(slotForKind(kinds[index] as NonCouponSlotKind, signals));
    }
  }

  const [{ data: sentRows }, { data: rejectedRows }, calendarEvents] = await Promise.all([
    (supabaseAdmin.from("ai_content_queue" as any) as any)
      .select("content_text")
      .eq("status", "sent")
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(10),
    (supabaseAdmin.from("ai_content_queue" as any) as any)
      .select("content_text, rejection_reason")
      .eq("status", "rejected")
      .order("updated_at", { ascending: false })
      .limit(10),
    loadCalendarContext(scheduledDates),
  ]);

  const sourceKinds = slots.map(sourceKind);
  const angles = pickAnglesForSources(sourceKinds);
  const briefing: AiBatchBriefing = {
    brandName: input.brandName.trim(),
    brandVoice: input.brandVoice.trim(),
    audience: input.audience.trim(),
    campaignName: audienceContext.campaign.name,
    campaignDescription: audienceContext.campaign.description,
    campaignObjective: input.campaignObjective.trim(),
    funnelStage: input.funnelStage,
    groupCount: audienceContext.groupCount,
    prohibitedClaims: input.prohibitedClaims.trim(),
  };
  const plans: AiPromptItemPlan[] = scheduledDates.map((date, index) => ({
    index: index + 1,
    date,
    weekday: weekdayLabel(date),
    commercialEvent: getCommercialDateName(date),
    crmEvents: calendarEvents.get(date) ?? [],
    objective: briefing.campaignObjective,
    angle: angles[index]!,
    sourceType: sourceKinds[index]!,
    verifiedFacts: sourceVerifiedFacts(slots[index] ?? null),
    allowedCta: allowedCta(slots[index] ?? null),
  }));
  const sentMessages = ((sentRows ?? []) as any[]).map((row) => ({ text: String(row.content_text).slice(0, 700) }));
  const rejectedMessages = ((rejectedRows ?? []) as any[]).map((row) => ({
    text: String(row.content_text).slice(0, 700),
    reason: row.rejection_reason ? String(row.rejection_reason).slice(0, 300) : "Rejeitada sem motivo informado.",
  }));
  const systemPrompt = buildAiContentSystemPrompt();
  const userPrompt = buildAiContentUserPrompt({ count, briefing, plans, playbook, sentMessages, rejectedMessages });
  const promptSnapshot = `SYSTEM\n${systemPrompt}\n\nUSER\n${userPrompt}`;

  let batchResult: { items: DraftItem[]; slotImageDataUris: (string | null)[]; model: string };
  try {
    batchResult = await callOpenAiBatch(apiKey, slots, count, systemPrompt, userPrompt);
  } catch (error) {
    const { cancelCouponsForBatch } = await import("./ai-coupons.server");
    await cancelCouponsForBatch(batchId);
    return { success: false, error: error instanceof Error ? error.message : "Falha ao gerar o lote com a OpenAI." };
  }

  const { uploadEnvioMedia } = await import("./envio-messages.server");
  const items: ContentQueueItem[] = [];

  for (const draft of batchResult.items) {
    const index = draft.index - 1;
    const slot = slots[index] ?? null;
    const slotDataUri = batchResult.slotImageDataUris[index];
    let contentImageUrl: string | null = null;
    try {
      if (slotDataUri) {
        contentImageUrl = (await uploadEnvioMedia({
          fileName: `ai-batch-${Date.now()}-${index}.jpg`,
          base64Data: dataUriToBase64(slotDataUri),
          contentType: dataUriContentType(slotDataUri),
        })).url;
      } else if ((!slot || slot.kind === "coupon") && draft.image_prompt) {
        const base64 = await generateImageBase64(apiKey, draft.image_prompt);
        contentImageUrl = (await uploadEnvioMedia({
          fileName: `ai-batch-${Date.now()}-${index}.png`,
          base64Data: base64,
          contentType: "image/png",
        })).url;
      }
    } catch (error) {
      console.error(`Falha ao preparar imagem do item ${draft.index}; seguindo sem imagem:`, error);
    }

    const link = expectedLink(slot);
    const scheduledDate = scheduledDates[index]!;
    const generationContext = {
      promptVersion: AI_CONTENT_PROMPT_VERSION,
      briefing,
      plan: plans[index],
      modelAudit: { factsUsed: draft.facts_used, riskFlags: draft.risk_flags },
      groupNames: audienceContext.groupNames,
    };

    const { data: inserted, error } = await (supabaseAdmin.from("ai_content_queue" as any) as any)
      .insert({
        batch_id: batchId,
        campaign_id: audienceContext.campaign.id,
        campaign_name: audienceContext.campaign.name,
        content_text: draft.message_text,
        content_image_url: contentImageUrl,
        link_type: link.type,
        link_url: link.url,
        source_summary: sourceSummary(slot),
        scheduled_date: scheduledDate,
        time_of_day: input.timeOfDay,
        status: "review",
        prompt_version: AI_CONTENT_PROMPT_VERSION,
        generation_model: batchResult.model,
        prompt_snapshot: promptSnapshot,
        generation_context: generationContext,
      } as never)
      .select("*")
      .single();

    if (error || !inserted) {
      console.error(`Falha ao salvar item ${draft.index} do lote:`, error);
      continue;
    }

    let row = inserted;
    if (link.type !== "none" && link.url) {
      const trackedUrl = `${APP_BASE_URL}/r/${row.id}`;
      const finalText = `${draft.message_text}\n\n🔗 ${trackedUrl}`;
      const { data: updated } = await (supabaseAdmin.from("ai_content_queue" as any) as any)
        .update({ content_text: finalText, updated_at: new Date().toISOString() } as never)
        .eq("id", row.id)
        .select("*")
        .single();
      if (updated) row = updated;
    }

    if (slot?.kind === "coupon") {
      const { associateCouponWithContentItem } = await import("./ai-coupons.server");
      await associateCouponWithContentItem(batchId, scheduledDate, row.id);
    }
    items.push(mapRow(row));
  }

  if (items.length !== count) {
    await (supabaseAdmin.from("ai_content_queue" as any) as any)
      .update({
        status: "rejected",
        rejection_reason: "Lote incompleto por falha de persistência.",
        updated_at: new Date().toISOString(),
      } as never)
      .eq("batch_id", batchId)
      .eq("status", "review");
    const { cancelCouponsForBatch } = await import("./ai-coupons.server");
    await cancelCouponsForBatch(batchId);
    return { success: false, error: `O lote ficou incompleto (${items.length}/${count}) e foi descartado com segurança.` };
  }

  return { success: true, batchId, items };
}


export async function listContentQueueBatch(batchId: string): Promise<ContentQueueItem[]> {
  const supabaseAdmin = await admin();
  const { data } = await (supabaseAdmin.from("ai_content_queue" as any) as any).select("*").eq("batch_id", batchId).order("scheduled_date", { ascending: true });
  return ((data ?? []) as any[]).map(mapRow);
}

export async function updateContentQueueItemText(id: string, contentText: string): Promise<{ success: true } | { success: false; error: string }> {
  const supabaseAdmin = await admin();
  const { error } = await (supabaseAdmin.from("ai_content_queue" as any) as any)
    .update({ content_text: contentText, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "review");
  if (error) return { success: false, error: error.message };
  return { success: true };
}

async function restoreReview(id: string, error: string): Promise<void> {
  const supabaseAdmin = await admin();
  await (supabaseAdmin.from("ai_content_queue" as any) as any)
    .update({ status: "review", last_error: error, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .eq("status", "processing");
}

async function approveOne(id: string): Promise<{ success: true } | { success: false; error: string }> {
  const supabaseAdmin = await admin();
  const now = new Date().toISOString();
  const { data: row, error: lockError } = await (supabaseAdmin.from("ai_content_queue" as any) as any)
    .update({ status: "processing", approved_at: now, last_error: null, updated_at: now } as never)
    .eq("id", id)
    .eq("status", "review")
    .select("*")
    .maybeSingle();
  if (lockError) return { success: false, error: lockError.message };
  if (!row) return { success: false, error: "Item não encontrado, já processado ou em processamento." };

  const scheduleError = validateAiBatchSchedule(String(row.scheduled_date), String(row.time_of_day));
  if (scheduleError) {
    await restoreReview(id, scheduleError);
    return { success: false, error: scheduleError };
  }

  const { resolveEnvioCampaignAudience } = await import("./envio-campaigns.server");
  let audience;
  try {
    audience = await resolveEnvioCampaignAudience(row.campaign_id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Campanha inválida.";
    await restoreReview(id, message);
    return { success: false, error: message };
  }
  if (audience.groupCount === 0) {
    const message = "A campanha não possui grupos vinculados.";
    await restoreReview(id, message);
    return { success: false, error: message };
  }

  const { activateCouponForContentItem, rollbackActivatedCouponForContentItem } = await import("./ai-coupons.server");
  const coupon = await activateCouponForContentItem(id);
  if (!coupon.success) {
    await restoreReview(id, coupon.error);
    return coupon;
  }

  const scheduledAt = scheduledAtInSaoPaulo(String(row.scheduled_date), String(row.time_of_day));
  let dispatch: { groupCount: number; messageIds: string[] };
  try {
    dispatch = await dispatchToCampaignGroups(row.campaign_id, row.content_text, row.content_image_url, scheduledAt.toISOString());
  } catch (error) {
    await rollbackActivatedCouponForContentItem(id);
    const message = error instanceof Error ? error.message : "Falha ao agendar os envios.";
    await restoreReview(id, message);
    return { success: false, error: message };
  }

  if (dispatch.groupCount === 0 || dispatch.messageIds.length === 0) {
    await rollbackActivatedCouponForContentItem(id);
    const message = "Nenhum envio foi criado porque a campanha está sem grupos válidos.";
    await restoreReview(id, message);
    return { success: false, error: message };
  }

  const { data: updated, error: updateError } = await (supabaseAdmin.from("ai_content_queue" as any) as any)
    .update({
      status: "scheduled",
      envio_message_id: dispatch.messageIds[0] ?? null,
      envio_message_ids: dispatch.messageIds,
      last_error: null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", id)
    .eq("status", "processing")
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    const { cancelPendingEnvioMessage } = await import("./envio-messages.server");
    for (const messageId of dispatch.messageIds) await cancelPendingEnvioMessage(messageId).catch(() => {});
    await rollbackActivatedCouponForContentItem(id);
    const message = updateError?.message ?? "O item mudou de estado durante a aprovação.";
    await restoreReview(id, message);
    return { success: false, error: message };
  }

  return { success: true };
}

export async function approveContentQueueItem(id: string): Promise<{ success: true } | { success: false; error: string }> {
  return approveOne(id);
}

export async function approveContentQueueBatch(batchId: string): Promise<{ approved: number; failed: number }> {
  const supabaseAdmin = await admin();
  const { data } = await (supabaseAdmin.from("ai_content_queue" as any) as any)
    .select("id")
    .eq("batch_id", batchId)
    .eq("status", "review");
  let approved = 0;
  let failed = 0;
  for (const row of (data ?? []) as any[]) {
    const result = await approveOne(row.id);
    if (result.success) approved++;
    else failed++;
  }
  return { approved, failed };
}

export async function rejectContentQueueItem(id: string, reason: string): Promise<{ success: true }> {
  const supabaseAdmin = await admin();
  const { data } = await (supabaseAdmin.from("ai_content_queue" as any) as any)
    .update({
      status: "rejected",
      rejection_reason: reason.trim() || "Rejeitada manualmente.",
      last_error: null,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", id)
    .eq("status", "review")
    .select("id")
    .maybeSingle();
  if (data) {
    const { cancelCouponForContentItem } = await import("./ai-coupons.server");
    const cancelled = await cancelCouponForContentItem(id);
    if (!cancelled.success) {
      await (supabaseAdmin.from("ai_content_queue" as any) as any)
        .update({ last_error: `Conteúdo rejeitado, mas o cupom não pôde ser cancelado: ${cancelled.error}` } as never)
        .eq("id", id);
    }
  }
  return { success: true };
}

export async function rejectContentQueueBatch(batchId: string, reason = "Lote fechado ou descartado sem aprovação."): Promise<{ rejected: number }> {
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin.from("ai_content_queue" as any) as any)
    .update({
      status: "rejected",
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("batch_id", batchId)
    .eq("status", "review")
    .select("id");
  if (error) return { rejected: 0 };

  const { cancelCouponsForBatch } = await import("./ai-coupons.server");
  await cancelCouponsForBatch(batchId);
  return { rejected: (data ?? []).length };
}

/** Sincroniza o conteúdo com todos os envios de grupo vinculados. Só marca sent quando todos
 * foram realmente enviados; qualquer falha deixa o resultado explícito. */
export async function syncAiContentQueueDeliveryStateForMessage(messageId: string): Promise<void> {
  const supabaseAdmin = await admin();
  let { data: row } = await (supabaseAdmin.from("ai_content_queue" as any) as any)
    .select("id, status, envio_message_id, envio_message_ids")
    .contains("envio_message_ids", [messageId])
    .in("status", ["processing", "scheduled"])
    .maybeSingle();

  if (!row) {
    const legacy = await (supabaseAdmin.from("ai_content_queue" as any) as any)
      .select("id, status, envio_message_id, envio_message_ids")
      .eq("envio_message_id", messageId)
      .in("status", ["processing", "scheduled"])
      .maybeSingle();
    row = legacy.data;
  }
  if (!row) return;

  const messageIds = ((row.envio_message_ids ?? []) as string[]).length > 0
    ? (row.envio_message_ids as string[])
    : row.envio_message_id ? [row.envio_message_id as string] : [];
  if (messageIds.length === 0) return;

  const { data: messages } = await (supabaseAdmin.from("envio_messages" as any) as any)
    .select("id, status, sent_at")
    .in("id", messageIds);
  const statuses = (messages ?? []) as any[];
  if (statuses.length !== messageIds.length) return;

  const now = new Date().toISOString();
  if (statuses.some((message) => message.status === "failed")) {
    const failed = statuses.filter((message) => message.status === "failed").length;
    await (supabaseAdmin.from("ai_content_queue" as any) as any)
      .update({
        status: "failed",
        last_error: `${failed} de ${messageIds.length} envio(s) falharam.`,
        updated_at: now,
      } as never)
      .eq("id", row.id);
    return;
  }

  if (statuses.every((message) => message.status === "sent")) {
    const sentAt = statuses.map((message) => message.sent_at).filter(Boolean).sort().at(-1) ?? now;
    await (supabaseAdmin.from("ai_content_queue" as any) as any)
      .update({ status: "sent", sent_at: sentAt, last_error: null, updated_at: now } as never)
      .eq("id", row.id);
    return;
  }

  await (supabaseAdmin.from("ai_content_queue" as any) as any)
    .update({ status: "scheduled", updated_at: now } as never)
    .eq("id", row.id)
    .in("status", ["processing", "scheduled"]);
}



function countBy(rows: any[], key: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = r[key];
    if (!k) continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}

export type PostPerformanceRow = {
  id: string;
  campaignName: string;
  scheduledDate: string;
  text: string;
  clicks: number;
  replies: number;
  exits24h: number;
  feedback: "good" | "bad" | null;
};

/** Reaproveitado tanto pelo job diário de aprendizado quanto pela aba Relatórios (visão por
 *  postagem). Cruza ai_content_queue (status='sent') com cliques/respostas (locais) e saída de
 *  grupo em até 24h após o envio (live-launchpad-79, correlacionado em memória por group_id). */
async function gatherPostPerformance(sinceIso: string): Promise<PostPerformanceRow[]> {
  const supabaseAdmin = await admin();
  const { data: sentItems } = await (supabaseAdmin.from("ai_content_queue" as any) as any)
    .select("*")
    .eq("status", "sent")
    .not("sent_at", "is", null)
    .gte("sent_at", sinceIso);
  const items = ((sentItems ?? []) as any[]).filter((item) => {
    const ids = Array.isArray(item.envio_message_ids) ? item.envio_message_ids : [];
    return ids.length > 0 || !!item.envio_message_id;
  });
  if (items.length === 0) return [];

  const idsForItem = (item: any): string[] => {
    const ids = Array.isArray(item.envio_message_ids)
      ? item.envio_message_ids.filter((id: unknown): id is string => typeof id === "string")
      : [];
    return [...new Set(ids.length > 0 ? ids : item.envio_message_id ? [String(item.envio_message_id)] : [])];
  };
  const messageIds = [...new Set(items.flatMap(idsForItem))];

  const [{ data: clicks }, { data: replies }, { data: feedback }, { data: envioMsgs }] = await Promise.all([
    (supabaseAdmin.from("envio_link_clicks" as any) as any).select("envio_message_id").in("envio_message_id", messageIds),
    (supabaseAdmin.from("envio_message_replies" as any) as any).select("envio_message_id").in("envio_message_id", messageIds),
    (supabaseAdmin.from("envio_message_feedback" as any) as any).select("envio_message_id, feedback").in("envio_message_id", messageIds),
    (supabaseAdmin.from("envio_messages" as any) as any).select("id, group_id, sent_at").in("id", messageIds),
  ]);

  const clicksByMsg = countBy((clicks ?? []) as any[], "envio_message_id");
  const repliesByMsg = countBy((replies ?? []) as any[], "envio_message_id");
  const feedbackByMsg = new Map(((feedback ?? []) as any[]).map((row) => [row.envio_message_id, row.feedback as "good" | "bad"]));
  const msgById = new Map(((envioMsgs ?? []) as any[]).map((message) => [message.id, message]));

  const groupIds = [...new Set(((envioMsgs ?? []) as any[]).map((message) => message.group_id).filter(Boolean))] as string[];
  let leaveEvents: any[] = [];
  if (groupIds.length > 0) {
    const { getLiveLaunchpadAdmin } = await import("@/integrations/supabase/live-launchpad-client.server");
    const liveLaunchpad = await getLiveLaunchpadAdmin();
    const { data } = await (liveLaunchpad.from("fe_group_events") as any)
      .select("group_id, created_at")
      .eq("event_type", "leave")
      .in("group_id", groupIds);
    leaveEvents = data ?? [];
  }

  function churnFor(envioMessageId: string): number {
    const message = msgById.get(envioMessageId);
    if (!message?.sent_at) return 0;
    const sentAt = new Date(message.sent_at).getTime();
    const windowEnd = sentAt + 24 * 3600_000;
    return leaveEvents.filter((event) =>
      event.group_id === message.group_id
      && new Date(event.created_at).getTime() >= sentAt
      && new Date(event.created_at).getTime() <= windowEnd
    ).length;
  }

  return items.map((item) => {
    const itemMessageIds = idsForItem(item);
    const itemFeedback = itemMessageIds.map((id) => feedbackByMsg.get(id)).filter(Boolean) as Array<"good" | "bad">;
    return {
      id: item.id as string,
      campaignName: item.campaign_name as string,
      scheduledDate: item.scheduled_date as string,
      text: (item.content_text as string).slice(0, 200),
      clicks: itemMessageIds.reduce((total, id) => total + (clicksByMsg.get(id) ?? 0), 0),
      replies: itemMessageIds.reduce((total, id) => total + (repliesByMsg.get(id) ?? 0), 0),
      exits24h: itemMessageIds.reduce((total, id) => total + churnFor(id), 0),
      feedback: itemFeedback.includes("bad") ? "bad" : itemFeedback.includes("good") ? "good" : null,
    };
  });
}

export async function getAiContentPerformance(days = 30): Promise<PostPerformanceRow[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = await gatherPostPerformance(since);
  return rows.sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));
}

/** Cron diário: olha os posts enviados nos últimos 14 dias, cruza com cliques/respostas/saída de
 *  grupo em até 24h/feedback manual, e pede pra IA extrair um playbook — o PRINCÍPIO por trás do
 *  que funcionou (não o texto literal) — que passa a ser injetado em toda geração futura. */
export async function runAiPlaybookUpdate(): Promise<{ success: boolean; itemsAnalyzed: number; error?: string }> {
  const { cleanupOrphanedAiCoupons } = await import("./ai-coupons.server");
  await cleanupOrphanedAiCoupons().catch((error) => console.error("runAiPlaybookUpdate: falha na limpeza de cupons:", error));

  const supabaseAdmin = await admin();
  const { data: settings } = await supabaseAdmin.from("store_settings").select("id, openai_api_key").order("created_at", { ascending: true }).limit(1).maybeSingle();
  const apiKey = (settings as any)?.openai_api_key as string | undefined;
  if (!apiKey || !settings) return { success: false, itemsAnalyzed: 0, error: "Sem API key da OpenAI configurada." };

  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const rows = await gatherPostPerformance(since);
  if (rows.length === 0) return { success: true, itemsAnalyzed: 0 };

  const prompt = `Você é um estrategista de marketing de e-commerce analisando o desempenho de postagens em grupos de WhatsApp (loja "Mania de Mulher"). Abaixo estão os últimos ${rows.length} posts enviados, cada um com: texto, cliques no link, respostas no grupo, quantas pessoas saíram do grupo nas 24h seguintes (sinal negativo), e feedback manual do dono (se houver).

POSTS:
${rows.map((r, i) => `${i + 1}. "${r.text}" — cliques: ${r.clicks}, respostas: ${r.replies}, saídas em 24h: ${r.exits24h}${r.feedback ? `, feedback do dono: ${r.feedback === "good" ? "BOM" : "RUIM"}` : ""}`).join("\n")}

Identifique PADRÕES — o que os posts com mais cliques/respostas e menos saídas têm em comum (ângulo, tom, tipo de gatilho, presença de link, etc), e o que os posts fracos ou marcados como "RUIM" têm em comum. Escreva um "playbook" curto (max. 6 bullets) com direções estratégicas pras próximas gerações — o PRINCÍPIO por trás do que funcionou, nunca a frase literal de um post específico. Se os dados forem poucos ou inconclusivos, diga isso e dê orientações gerais cautelosas em vez de inventar padrão.

Responda em JSON estrito: { "playbook": string }`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Você é um estrategista de marketing sênior. Responda sempre em JSON válido, nunca invente número que não esteja nos dados." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    return { success: false, itemsAnalyzed: rows.length, error: `OpenAI respondeu ${res.status}: ${errBody.slice(0, 300)}` };
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) return { success: false, itemsAnalyzed: rows.length, error: "OpenAI não retornou conteúdo." };

  const { playbook } = JSON.parse(content) as { playbook: string };

  await supabaseAdmin
    .from("store_settings")
    .update({ ai_marketing_playbook: playbook, ai_marketing_playbook_updated_at: new Date().toISOString() } as never)
    .eq("id", (settings as any).id);

  return { success: true, itemsAnalyzed: rows.length };
}
