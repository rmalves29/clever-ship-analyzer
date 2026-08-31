import { z } from "zod";
import { fetchImageAsDataUri, dataUriToBase64, dataUriContentType, dispatchToCampaignGroups } from "./ai-send-routines.server";
import type { BestSellingProduct } from "./shopify-products.server";
import type { ShopifyProductDetail } from "./shopify.server";
import type { Ga4Record } from "./google-analytics.server";
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
  contentMediaType: "none" | "image" | "video_note";
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
    contentMediaType: row.content_media_type ?? (row.content_image_url ? "image" : "none"),
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

type SlotMedia = {
  sourceUrl: string;
  previewImageUrl: string | null;
  preferredType: "image" | "video_note";
};

type ProductSourceSlot = {
  kind: "top_seller" | "top_viewed" | "top_recent_launch";
  title: string;
  description: string | null;
  productUrl: string | null;
  productId: string;
  views: number | null;
  periodLabel?: string;
  launchRankedByViews: boolean;
  media: SlotMedia;
};

type MetaAdsSourceSlot = {
  kind: "top_ad_ctr";
  name: string;
  impressions: number;
  ctr: number;
  ctrMetric: "link" | "all";
  destinationUrl: string | null;
  media: SlotMedia;
};

type InstagramSourceSlot = {
  kind: "top_instagram" | "top_story_or_reel";
  caption: string | null;
  permalink: string | null;
  resultLabel: string;
  resultValue: number;
  media: SlotMedia;
};

type ContentSlot = ProductSourceSlot | MetaAdsSourceSlot | InstagramSourceSlot | null;
type SlotKind = "top_ad_ctr" | "top_seller" | "top_instagram" | "top_viewed" | "top_story_or_reel" | "top_recent_launch";

function buildScheduledDates(startDate: string, count: number): string[] {
  const [startYear, startMonth, startDay] = startDate.split("-").map(Number) as [number, number, number];
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(startYear, startMonth - 1, startDay + i);
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return dates;
}

const SLOT_KINDS: SlotKind[] = ["top_ad_ctr", "top_seller", "top_instagram", "top_viewed", "top_story_or_reel", "top_recent_launch"];

/** As seis fontes entram uma vez cada no calendário, em ordem embaralhada. */
function assignSlotKinds(scheduledDates: string[]): SlotKind[] {
  return [...SLOT_KINDS].sort(() => Math.random() - 0.5).slice(0, scheduledDates.length);
}

function dateOnlyToSaoPauloISO(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00-03:00`).toISOString();
}

/** "Semana anterior" = os 7 dias corridos completos anteriores a `startDate`. */
function previousWeekRange(startDate: string): { sinceDate: string; endDate: string; untilDate: string; sinceISO: string; untilISO: string } {
  const [y, m, d] = startDate.split("-").map(Number) as [number, number, number];
  const fmt = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  const untilDate = fmt(new Date(y, m - 1, d));
  const sinceDate = fmt(new Date(y, m - 1, d - 7));
  const endDate = fmt(new Date(y, m - 1, d - 1));
  return { sinceDate, endDate, untilDate, sinceISO: dateOnlyToSaoPauloISO(sinceDate), untilISO: dateOnlyToSaoPauloISO(untilDate) };
}

type WeeklySignals = {
  topAdCtr: MetaAdsSourceSlot | null;
  topSeller: ProductSourceSlot | null;
  topInstagram: InstagramSourceSlot | null;
  topViewed: ProductSourceSlot | null;
  topStoryOrReel: InstagramSourceSlot | null;
  topRecentLaunch: ProductSourceSlot | null;
};

function normalizedProductId(value: string): string {
  return value.replace(/^gid:\/\/shopify\/Product\//, "").trim();
}

function normalizedTitle(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function productMedia(detail: ShopifyProductDetail): SlotMedia | null {
  return detail.featuredImageUrl
    ? { sourceUrl: detail.featuredImageUrl, previewImageUrl: detail.featuredImageUrl, preferredType: "image" }
    : null;
}

function instagramMedia(item: InstagramMedia): SlotMedia | null {
  const isVideo = item.mediaType === "VIDEO" || item.productType === "REELS";
  if (isVideo && item.mediaUrl) {
    return { sourceUrl: item.mediaUrl, previewImageUrl: item.thumbnailUrl, preferredType: "video_note" };
  }
  const imageUrl = item.mediaUrl ?? item.thumbnailUrl;
  return imageUrl ? { sourceUrl: imageUrl, previewImageUrl: item.thumbnailUrl ?? imageUrl, preferredType: "image" } : null;
}

function findRecentProductForGaRow(row: Ga4Record, products: ShopifyProductDetail[]): ShopifyProductDetail | null {
  const itemId = normalizedProductId(String(row.itemId ?? ""));
  const itemName = normalizedTitle(String(row.itemName ?? ""));
  const handle = String(row.productHandle ?? "").trim().toLocaleLowerCase("pt-BR");
  return products.find((product) => handle && product.handle.toLocaleLowerCase("pt-BR") === handle)
    ?? products.find((product) => normalizedProductId(product.id) === itemId)
    ?? products.find((product) => itemName && normalizedTitle(product.title) === itemName)
    ?? null;
}

async function resolveGa4Product(row: Ga4Record, recentProducts: ShopifyProductDetail[]): Promise<ShopifyProductDetail | null> {
  const recent = findRecentProductForGaRow(row, recentProducts);
  if (recent) return recent;

  const { getShopifyProductByHandle, getShopifyProductById, getShopifyProductByTitle } = await import("./shopify.server");
  const handle = String(row.productHandle ?? "").trim();
  if (handle) {
    const byHandle = await getShopifyProductByHandle(handle);
    if (byHandle) return byHandle;
  }
  const rawId = String(row.itemId ?? "").trim();
  const numericId = normalizedProductId(rawId);
  if (/^\d+$/.test(numericId)) {
    const byId = await getShopifyProductById(`gid://shopify/Product/${numericId}`);
    if (byId) return byId;
  } else if (rawId.startsWith("gid://shopify/Product/")) {
    const byId = await getShopifyProductById(rawId);
    if (byId) return byId;
  }
  return getShopifyProductByTitle(String(row.itemName ?? ""));
}

function ga4Views(row: Ga4Record): number {
  return Number(row.itemsViewed ?? row.itemViewEvents ?? row.screenPageViews ?? 0);
}

function shiftIsoDate(date: string, days: number): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

async function firstResolvableViewedProduct(
  rows: Ga4Record[],
  recentProducts: ShopifyProductDetail[],
  excludedIds: Set<string>,
): Promise<{ detail: ShopifyProductDetail; row: Ga4Record } | null> {
  for (const row of rows) {
    const detail = await resolveGa4Product(row, recentProducts);
    if (!detail || excludedIds.has(normalizedProductId(detail.id)) || !productMedia(detail)) continue;
    return { detail, row };
  }
  return null;
}

/** Junta as seis fontes reais: Ads por CTR de link, Shopify por vendas, Instagram por resultado,
 * GA4 por visualização, Story ativo (ou Reels) e lançamento recente mais visto. */
async function gatherWeeklySignals(startDate: string): Promise<WeeklySignals> {
  const { sinceDate, endDate, sinceISO, untilISO } = previousWeekRange(startDate);
  const { getBestSellingProducts } = await import("./shopify-products.server");
  const { getShopifyProductsByIds, getShopifyRecentProducts, getShopifyProductByTitle } = await import("./shopify.server");
  const { getInstagramTopContentInRange, getInstagramActiveStories } = await import("./instagram.server");
  const { getMetaAdsTopCtrCreativeInRange } = await import("./meta-ads.server");
  const { getGa4MostViewedProducts } = await import("./google-analytics.server");

  const bestSellers = await getBestSellingProducts({ startISO: sinceISO, endISO: untilISO, limit: 1 }).catch(() => [] as BestSellingProduct[]);
  const bestSellerIds = bestSellers.map((product) => product.productId).filter((id): id is string => Boolean(id));
  const [productDetails, gaRows, recentProducts, igResult, storiesResult, adsResult] = await Promise.all([
    getShopifyProductsByIds(bestSellerIds).catch(() => new Map<string, ShopifyProductDetail>()),
    getGa4MostViewedProducts({ startDate: sinceDate, endDate }, bestSellerIds).catch(() => [] as Ga4Record[]),
    getShopifyRecentProducts(20).catch(() => [] as ShopifyProductDetail[]),
    getInstagramTopContentInRange(sinceISO, untilISO).catch(() => ({ success: false as const, error: "" })),
    getInstagramActiveStories().catch(() => ({ success: false as const, error: "" })),
    getMetaAdsTopCtrCreativeInRange(sinceDate, endDate, 100).catch(() => ({ success: false as const, error: "" })),
  ]);

  const seller = bestSellers[0];
  const sellerDetail = seller
    ? (seller.productId ? productDetails.get(seller.productId) : null) ?? await getShopifyProductByTitle(seller.title)
    : null;
  const sellerMedia = sellerDetail ? productMedia(sellerDetail) : null;
  const topSeller: ProductSourceSlot | null = seller && sellerDetail && sellerMedia
    ? { kind: "top_seller", title: sellerDetail.title, description: sellerDetail.description, productUrl: sellerDetail.productUrl, productId: sellerDetail.id, views: null, launchRankedByViews: false, media: sellerMedia }
    : null;

  const excludedIds = new Set(bestSellerIds.map(normalizedProductId));
  if (sellerDetail) excludedIds.add(normalizedProductId(sellerDetail.id));
  let viewRowsForSelection = gaRows;
  let viewPeriodLabel = "semana anterior";
  let viewed = await firstResolvableViewedProduct(viewRowsForSelection, recentProducts, excludedIds);
  if (!viewed) {
    // A propriedade pode ter sido ligada recentemente ou não ter `view_item` na semana exata.
    // Mantemos a fonte GA4 e ampliamos somente até 30 dias, informando a janela usada no card.
    viewRowsForSelection = await getGa4MostViewedProducts(
      { startDate: shiftIsoDate(endDate, -29), endDate },
      bestSellerIds,
    ).catch(() => [] as Ga4Record[]);
    viewPeriodLabel = "últimos 30 dias (fallback sem dado resolvível na semana anterior)";
    viewed = await firstResolvableViewedProduct(viewRowsForSelection, recentProducts, excludedIds);
  }
  const viewedDetail = viewed?.detail ?? null;
  const viewedRow = viewed?.row ?? null;
  const viewedMedia = viewedDetail ? productMedia(viewedDetail) : null;
  const topViewed: ProductSourceSlot | null = viewedDetail && viewedRow && viewedMedia
    ? { kind: "top_viewed", title: viewedDetail.title, description: viewedDetail.description, productUrl: viewedDetail.productUrl, productId: viewedDetail.id, views: ga4Views(viewedRow), periodLabel: viewPeriodLabel, launchRankedByViews: false, media: viewedMedia }
    : null;
  if (viewedDetail) excludedIds.add(normalizedProductId(viewedDetail.id));

  let launchDetail: ShopifyProductDetail | null = null;
  let launchViews: number | null = null;
  for (const row of viewRowsForSelection) {
    const candidate = findRecentProductForGaRow(row, recentProducts);
    if (!candidate || excludedIds.has(normalizedProductId(candidate.id)) || !productMedia(candidate)) continue;
    launchDetail = candidate;
    launchViews = ga4Views(row);
    break;
  }
  if (!launchDetail) {
    launchDetail = recentProducts.find((product) => !excludedIds.has(normalizedProductId(product.id)) && Boolean(productMedia(product))) ?? null;
  }
  const launchMedia = launchDetail ? productMedia(launchDetail) : null;
  const topRecentLaunch: ProductSourceSlot | null = launchDetail && launchMedia
    ? { kind: "top_recent_launch", title: launchDetail.title, description: launchDetail.description, productUrl: launchDetail.productUrl, productId: launchDetail.id, views: launchViews, launchRankedByViews: launchViews !== null, media: launchMedia }
    : null;

  const ad = adsResult.success ? adsResult.creative : null;
  const adSourceUrl = ad?.mediaUrl ?? ad?.thumbnailUrl ?? null;
  const topAdCtr: MetaAdsSourceSlot | null = ad && adSourceUrl
    ? {
        kind: "top_ad_ctr",
        name: ad.name,
        impressions: ad.impressions,
        ctr: ad.ctrMetric === "link" ? ad.ctrLink : ad.ctrAll,
        ctrMetric: ad.ctrMetric,
        destinationUrl: ad.destinationUrl,
        media: { sourceUrl: adSourceUrl, previewImageUrl: ad.thumbnailUrl, preferredType: ad.mediaType === "video" ? "video_note" : "image" },
      }
    : null;

  const instagramItems = igResult.success ? igResult.media : [];
  const feedWinner = instagramItems
    .filter((item) => item.mediaType === "IMAGE" || item.mediaType === "CAROUSEL_ALBUM")
    .sort((a, b) => b.totalInteractions - a.totalInteractions || b.reach - a.reach)
    .find((item) => Boolean(instagramMedia(item)));
  const feedMedia = feedWinner ? instagramMedia(feedWinner) : null;
  const topInstagram: InstagramSourceSlot | null = feedWinner && feedMedia
    ? { kind: "top_instagram", caption: feedWinner.caption, permalink: feedWinner.permalink, resultLabel: "interações", resultValue: feedWinner.totalInteractions, media: feedMedia }
    : null;

  const activeStory = storiesResult.success ? storiesResult.media.find((item) => Boolean(instagramMedia(item))) : undefined;
  const bestReel = instagramItems
    .filter((item) => item.mediaType === "VIDEO" || item.productType === "REELS")
    .sort((a, b) => b.views - a.views || b.reach - a.reach || b.totalInteractions - a.totalInteractions)
    .find((item) => Boolean(instagramMedia(item)));
  const storyOrReel = activeStory ?? bestReel;
  const storyOrReelMedia = storyOrReel ? instagramMedia(storyOrReel) : null;
  const topStoryOrReel: InstagramSourceSlot | null = storyOrReel && storyOrReelMedia
    ? {
        kind: "top_story_or_reel",
        caption: storyOrReel.caption,
        permalink: storyOrReel.permalink,
        resultLabel: activeStory ? "visualizações do Story ativo" : "resultado do Reels da semana anterior",
        resultValue: activeStory ? activeStory.views || activeStory.reach : bestReel?.views || bestReel?.reach || bestReel?.totalInteractions || 0,
        media: storyOrReelMedia,
      }
    : null;

  return { topAdCtr, topSeller, topInstagram, topViewed, topStoryOrReel, topRecentLaunch };
}

function slotForKind(kind: SlotKind, signals: WeeklySignals): ContentSlot {
  switch (kind) {
    case "top_ad_ctr": return signals.topAdCtr;
    case "top_seller": return signals.topSeller;
    case "top_instagram": return signals.topInstagram;
    case "top_viewed": return signals.topViewed;
    case "top_story_or_reel": return signals.topStoryOrReel;
    case "top_recent_launch": return signals.topRecentLaunch;
  }
}

function sourceKind(slot: ContentSlot): AiSourceKind {
  return slot?.kind ?? "none";
}

function sourceVerifiedFacts(slot: ContentSlot): string[] {
  if (!slot) return ["Nenhuma fonte comercial específica estava disponível; fale apenas da marca sem inventar produto ou oferta."];
  switch (slot.kind) {
    case "top_ad_ctr":
      return [
        `O anúncio "${slot.name}" teve o melhor CTR ${slot.ctrMetric === "link" ? "de link" : "geral"} elegível da semana anterior (${(slot.ctr * 100).toFixed(2)}%, ${slot.impressions} impressões).`,
      ];
    case "top_seller":
      return [
        `"${slot.title}" foi o produto mais vendido na semana anterior.`,
        ...(slot.description ? [`Descrição cadastrada: ${slot.description.slice(0, 300)}`] : []),
      ];
    case "top_viewed":
      return [
        `"${slot.title}" foi o produto mais visualizado no GA4 em ${slot.periodLabel ?? "semana anterior"} entre os elegíveis, sem repetir o mais vendido${slot.views !== null ? ` (${slot.views} visualizações registradas)` : ""}.`,
        ...(slot.description ? [`Descrição cadastrada: ${slot.description.slice(0, 300)}`] : []),
      ];
    case "top_recent_launch":
      return [
        slot.launchRankedByViews
          ? `"${slot.title}" foi o mais visualizado no GA4 entre os 20 produtos ativos mais recentes${slot.views !== null ? ` (${slot.views} visualizações registradas)` : ""}.`
          : `"${slot.title}" está entre os 20 produtos ativos cadastrados mais recentemente na Shopify.`,
        ...(slot.description ? [`Descrição cadastrada: ${slot.description.slice(0, 300)}`] : []),
      ];
    case "top_instagram":
      return [
        `A publicação de imagem teve o melhor resultado entre os posts do Instagram da semana anterior (${slot.resultValue} ${slot.resultLabel}).`,
        ...(slot.caption ? [`Legenda original: ${slot.caption.slice(0, 500)}`] : []),
      ];
    case "top_story_or_reel":
      return [
        `O conteúdo selecionado teve o melhor ${slot.resultLabel}${slot.resultValue ? ` (${slot.resultValue})` : ""}. Stories são avaliados somente enquanto estão ativos; sem Story ativo, usa-se o melhor Reels da semana anterior.`,
        ...(slot.caption ? [`Legenda original: ${slot.caption.slice(0, 500)}`] : []),
      ];
  }
}

function sourceSummary(slot: ContentSlot): string {
  if (!slot) return "Marca em geral, sem fonte comercial específica.";
  switch (slot.kind) {
    case "top_ad_ctr": return `Anúncio com melhor CTR ${slot.ctrMetric === "link" ? "de link" : "geral"}: ${slot.name}.`;
    case "top_seller": return `Produto mais vendido: ${slot.title}.`;
    case "top_instagram": return "Publicação de imagem com melhor resultado no Instagram.";
    case "top_viewed": return `Produto mais visualizado no GA4 em ${slot.periodLabel ?? "semana anterior"}, sem repetir o mais vendido: ${slot.title}.`;
    case "top_story_or_reel": return slot.resultLabel.includes("Story") ? "Story ativo mais visualizado." : "Melhor Reels da semana anterior (fallback sem Story ativo).";
    case "top_recent_launch": return `Lançamento recente${slot.launchRankedByViews ? " mais visualizado" : ""}: ${slot.title}.`;
  }
}

function expectedLink(slot: ContentSlot): { type: "instagram" | "site" | "none"; url: string | null } {
  if (!slot) return { type: "none", url: null };
  if (slot.kind === "top_instagram" || slot.kind === "top_story_or_reel") {
    return slot.permalink ? { type: "instagram", url: slot.permalink } : { type: "none", url: null };
  }
  if (slot.kind === "top_ad_ctr") {
    return slot.destinationUrl ? { type: "site", url: slot.destinationUrl } : { type: "none", url: null };
  }
  if (slot.kind === "top_seller" || slot.kind === "top_viewed" || slot.kind === "top_recent_launch") {
    return slot.productUrl ? { type: "site", url: slot.productUrl } : { type: "none", url: null };
  }
  return { type: "none", url: null };
}

function allowedCta(slot: ContentSlot): string {
  const link = expectedLink(slot);
  if (link.type === "instagram") return "Convidar a ver a publicação no Instagram.";
  if (link.type === "site") return "Convidar a ver o produto no site.";
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
      max_tokens: count > 1 ? 3000 : 900,
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
      if (!slot) return Promise.resolve(null);
      return slot.media.previewImageUrl ? fetchImageAsDataUri(slot.media.previewImageUrl) : Promise.resolve(null);
    }),
  );

  const imageParts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
  slots.forEach((slot, index) => {
    const dataUri = slotImageDataUris[index];
    if (!dataUri || !slot) return;
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

  const count = input.mode === "week" ? 6 : 1;
  const scheduledDates = buildScheduledDates(input.startDate, count);
  const batchId = crypto.randomUUID();
  const signals = await gatherWeeklySignals(input.startDate);
  const labels: Record<SlotKind, string> = {
    top_ad_ctr: "anúncio com melhor CTR",
    top_seller: "produto mais vendido",
    top_instagram: "melhor publicação do Instagram",
    top_viewed: "produto mais visualizado no GA4",
    top_story_or_reel: "Story ativo ou Reels",
    top_recent_launch: "lançamento recente",
  };
  const availableKinds = SLOT_KINDS.filter((kind) => Boolean(slotForKind(kind, signals)));
  if (availableKinds.length === 0) {
    return { success: false, error: "Nenhuma das fontes necessárias retornou um conteúdo com mídia. Verifique Meta Ads, Instagram, Shopify e GA4." };
  }
  if (input.mode === "week" && availableKinds.length !== SLOT_KINDS.length) {
    const missing = SLOT_KINDS.filter((kind) => !availableKinds.includes(kind)).map((kind) => labels[kind]);
    return { success: false, error: `Não foi possível montar as 6 mensagens com mídia. Fontes ausentes: ${missing.join(", ")}.` };
  }

  const kinds = input.mode === "week"
    ? assignSlotKinds(scheduledDates)
    : [[...availableKinds].sort(() => Math.random() - 0.5)[0]!];
  const slots: ContentSlot[] = kinds.map((kind) => slotForKind(kind, signals));

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
    return { success: false, error: error instanceof Error ? error.message : "Falha ao gerar o lote com a OpenAI." };
  }

  const { mirrorRemoteEnvioMedia, uploadEnvioMedia } = await import("./envio-messages.server");
  const items: ContentQueueItem[] = [];

  for (const draft of batchResult.items) {
    const index = draft.index - 1;
    const slot = slots[index] ?? null;
    const slotDataUri = batchResult.slotImageDataUris[index];
    let contentImageUrl: string | null = null;
    let contentMediaType: "none" | "image" | "video_note" = "none";
    try {
      if (!slot) throw new Error("Fonte do conteúdo não encontrada.");
      try {
        const mirrored = await mirrorRemoteEnvioMedia({
          sourceUrl: slot.media.sourceUrl,
          fileStem: `ai-batch-${slot.kind}-${index}`,
        });
        contentImageUrl = mirrored.url;
        contentMediaType = slot.media.preferredType === "video_note" && mirrored.contentType.startsWith("video/")
          ? "video_note"
          : "image";
      } catch (primaryError) {
        if (!slotDataUri) throw primaryError;
        console.error(`Falha ao espelhar a mídia principal do item ${draft.index}; usando a imagem de capa:`, primaryError);
        contentImageUrl = (await uploadEnvioMedia({
          fileName: `ai-batch-${Date.now()}-${index}.jpg`,
          base64Data: dataUriToBase64(slotDataUri),
          contentType: dataUriContentType(slotDataUri),
        })).url;
        contentMediaType = "image";
      }
    } catch (error) {
      console.error(`Falha ao preparar a mídia obrigatória do item ${draft.index}:`, error);
      continue;
    }

    const link = expectedLink(slot);
    const scheduledDate = scheduledDates[index]!;
    const generationContext = {
      promptVersion: AI_CONTENT_PROMPT_VERSION,
      briefing,
      plan: plans[index],
      modelAudit: { factsUsed: draft.facts_used, riskFlags: draft.risk_flags },
      media: { type: contentMediaType, sourceType: slot?.media.preferredType ?? "none" },
      groupNames: audienceContext.groupNames,
    };

    const { data: inserted, error } = await (supabaseAdmin.from("ai_content_queue" as any) as any)
      .insert({
        batch_id: batchId,
        campaign_id: audienceContext.campaign.id,
        campaign_name: audienceContext.campaign.name,
        content_text: draft.message_text,
        content_image_url: contentImageUrl,
        content_media_type: contentMediaType,
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

  const scheduledAt = scheduledAtInSaoPaulo(String(row.scheduled_date), String(row.time_of_day));
  let dispatch: { groupCount: number; messageIds: string[] };
  try {
    dispatch = await dispatchToCampaignGroups(
      row.campaign_id,
      row.content_text,
      row.content_image_url,
      scheduledAt.toISOString(),
      row.content_media_type === "video_note" ? "video_note" : "image",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao agendar os envios.";
    await restoreReview(id, message);
    return { success: false, error: message };
  }

  if (dispatch.groupCount === 0 || dispatch.messageIds.length === 0) {
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
    const ids: string[] = Array.isArray(item.envio_message_ids)
      ? (item.envio_message_ids as unknown[]).filter((id): id is string => typeof id === "string")
      : [];
    const candidates: string[] = ids.length > 0
      ? ids
      : item.envio_message_id
        ? [String(item.envio_message_id)]
        : [];
    return Array.from(new Set<string>(candidates));
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
