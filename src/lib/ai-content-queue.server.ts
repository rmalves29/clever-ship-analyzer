import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { fetchImageAsDataUri, dataUriToBase64, dataUriContentType, generateImageBase64, dispatchToCampaignGroups } from "./ai-send-routines.server";
import type { BestSellingProduct } from "./shopify-products.server";
import type { InstagramMedia } from "./instagram.server";

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
  status: "review" | "approved" | "rejected" | "sent" | "failed";
  envioMessageId: string | null;
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
  };
}

type DraftItem = {
  message_text: string;
  use_image: "product" | "post" | "generate" | "none";
  image_prompt: string | null;
  link_type: "instagram" | "site" | "none";
  source_summary: string;
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

type SignalsContext = {
  slots: ContentSlot[]; // length === count, index-alinhado com angles/mensagens
  playbook: string | null;
  recentTexts: string[];
};

/** Deixar a diversidade só na mão da IA não é confiável — com os mesmos sinais de entrada, o
 *  modelo tende a convergir pra respostas parecidas entre chamadas separadas, mesmo com
 *  temperature alta (reportado pelo usuário: cancelar e gerar de novo voltava com as mesmas
 *  mensagens). Forçar um ângulo diferente e sorteado por item, por chamada, garante diversidade
 *  mecânica em vez de só pedir por texto. */
const ANGLE_POOL = [
  "pergunta direta que gera curiosidade",
  "urgência (tempo acabando, últimas unidades)",
  "prova social (outras clientes comprando/amando)",
  "bastidores (algo íntimo da loja/processo)",
  "escassez (edição limitada, poucas peças)",
  "benefício direto e prático pro dia a dia",
  "storytelling curto (uma cena/situação)",
  "convite pra interação (pergunta, enquete, peça opinião)",
  "comparação antes/depois ou com/sem o produto",
  "humor leve ou tom descontraído",
  "dica de uso prático (como combinar, quando usar)",
  "contagem regressiva / prazo específico",
] as const;

function pickAngles(count: number): string[] {
  const shuffled = [...ANGLE_POOL].sort(() => Math.random() - 0.5);
  const picked: string[] = [];
  for (let i = 0; i < count; i++) picked.push(shuffled[i % shuffled.length]!);
  return picked;
}

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

function slotDescription(slot: ContentSlot): string {
  if (!slot) return "Fonte: NENHUM dado disponível — fale da marca/loja em geral, gatilho mental sem citar produto específico";
  switch (slot.kind) {
    case "top_seller_1":
      return `Fonte: produto #1 mais VENDIDO na semana passada — "${slot.title}"${slot.description ? `. Descrição real do produto: "${slot.description.slice(0, 300)}"` : ""}`;
    case "top_seller_2":
      return `Fonte: produto #2 mais VENDIDO na semana passada — "${slot.title}"${slot.description ? `. Descrição real do produto: "${slot.description.slice(0, 300)}"` : ""}`;
    case "top_visited":
      return `Fonte: produto mais ACESSADO no site na semana passada (bastante gente entrou pra ver) — "${slot.title}"${slot.description ? `. Descrição real do produto: "${slot.description.slice(0, 300)}"` : ""}`;
    case "top_post_1":
    case "top_post_2":
      return `Fonte: post do Instagram com mais engajamento na semana passada — legenda original: "${slot.caption ?? "(sem legenda)"}"`;
    case "top_reel":
      return `Fonte: Reels com mais engajamento na semana passada — legenda original: "${slot.caption ?? "(sem legenda)"}"`;
    case "coupon":
      return `Fonte: CUPOM DE DESCONTO exclusivo pro Grupo VIP — código "${slot.code}", ${slot.percentageLabel} OFF, válido só até ${slot.expiresAtLabel}. Use EXATAMENTE esses dados — nunca invente nem altere código, percentual ou validade.`;
  }
}

function buildBatchPrompt(ctx: SignalsContext, count: number, angles: string[]): string {
  return `Você é um copywriter de e-commerce especialista em WhatsApp pra grupos (moda feminina, loja "Mania de Mulher"). Escreva ${count} mensage${count > 1 ? "ns" : "m"} DIFERENTE${count > 1 ? "S" : ""} pra disparar em grupos de WhatsApp, uma por dia.

CONFIGURAÇÃO OBRIGATÓRIA DE CADA MENSAGEM (mensagem 1 = item 1 do array JSON, etc — siga essa ordem e essa atribuição à risca, nunca troque):
${angles.map((a, i) => `${i + 1}. Ângulo: ${a} — ${slotDescription(ctx.slots[i] ?? null)}`).join("\n")}

REGRAS OBRIGATÓRIAS:
- Siga o ângulo E a fonte designada de cada mensagem à risca — é isso que garante que o lote não saia parecido, e que gerar de novo não volte com as mesmas mensagens de antes.
- Use gatilhos mentais de verdade (escassez, urgência, prova social, curiosidade, benefício claro) — sem exagero forçado, sem soar robótico.
- Quando a fonte for um produto ou um cupom, seja CONCRETO (cite o nome do produto/o que o torna especial, ou o código e percentual exato do cupom) em vez de frases vagas tipo "nossos acessórios" que servem pra qualquer loja. Quando a fonte for "nenhum dado disponível", tudo bem ser mais genérico de marca.
- Máximo 6 linhas por mensagem, emoji com moderação.
- Se a fonte for um post/Reels do Instagram, marque "link_type":"instagram". Se a fonte for um produto (vendido ou acessado), marque "link_type":"site". Se a fonte for cupom ou nenhum dado disponível, marque "link_type":"none" (o cupom já leva o código escrito na própria mensagem, não precisa de link).
- NUNCA escreva a URL literal no texto — só o convite claro ("responde aqui", "corre no link abaixo", "olha nosso Instagram") — o link real é adicionado depois, fora do seu texto.
- Se a fonte for CUPOM: use exatamente o código, percentual e validade fornecidos — NUNCA invente nem altere esses dados. Deixe claro que é um benefício exclusivo pro Grupo VIP.
- Imagem: se a fonte tiver uma imagem real anexada (produto ou post/Reels, rotulada abaixo), marque "use_image" como "product" (produto vendido/acessado) ou "post" (post/Reels do Instagram) — a imagem certa é resolvida automaticamente pela fonte atribuída, você só escolhe o TIPO, não precisa (nem consegue) escolher qual foto. Se a fonte não tiver imagem (cupom, ou nenhum dado disponível), use "generate" (descrevendo no image_prompt algo condizente com a mensagem) ou "none".

${ctx.playbook ? `O QUE JÁ SABEMOS QUE FUNCIONA (aprendizado de mensagens anteriores — use como direção estratégica, NÃO copie frases):\n${ctx.playbook}\n` : ""}
${ctx.recentTexts.length > 0 ? `MENSAGENS JÁ ENVIADAS RECENTEMENTE (NÃO repita a estrutura/abertura destas):\n${ctx.recentTexts.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n` : ""}

Responda em JSON estrito, um array com exatamente ${count} item(ns):
{ "items": [ { "message_text": string, "use_image": "product"|"post"|"generate"|"none", "image_prompt": string|null, "link_type": "instagram"|"site"|"none", "source_summary": string (1 frase curta) } ] }`;
}

async function requestBatchCompletion(
  apiKey: string,
  model: string,
  ctx: SignalsContext,
  count: number,
  angles: string[],
  imageParts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>,
): Promise<DraftItem[]> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Você é um copywriter de e-commerce sênior, especialista em variar tom e estrutura entre mensagens. Responda sempre em JSON válido." },
        { role: "user", content: [{ type: "text", text: buildBatchPrompt(ctx, count, angles) }, ...imageParts] },
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
  const parsed = JSON.parse(content) as { items: DraftItem[] };
  if (!Array.isArray(parsed.items) || parsed.items.length === 0) throw new Error(`OpenAI (${model}) não retornou nenhum item.`);
  return parsed.items;
}

// gpt-4o (não o -mini) é o preferido pra essa geração especificamente: modelo menor tende a
// convergir em vocabulário/fraseado parecidos entre chamadas separadas mesmo com o mesmo ângulo/
// temperature alta — reportado pelo usuário como "continua repetindo". Mas se essa API key não
// tiver acesso ao gpt-4o (ou tiver algum problema pontual), cai pro mini em vez de quebrar a
// geração inteira — melhor um lote menos variado do que nenhum lote.
const PREFERRED_MODEL = "gpt-4o";
const FALLBACK_MODEL = "gpt-4o-mini";

async function callOpenAiBatch(
  apiKey: string,
  ctx: SignalsContext,
  count: number,
): Promise<{ items: DraftItem[]; slotImageDataUris: (string | null)[] }> {
  const slotImageDataUris = await Promise.all(
    ctx.slots.map((slot) => {
      if (!slot || slot.kind === "coupon") return Promise.resolve(null);
      return slot.imageUrl ? fetchImageAsDataUri(slot.imageUrl) : Promise.resolve(null);
    }),
  );

  const imageParts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
  ctx.slots.forEach((slot, i) => {
    const dataUri = slotImageDataUris[i];
    if (!dataUri || !slot || slot.kind === "coupon") return;
    const isInstagramSlot = slot.kind === "top_post_1" || slot.kind === "top_post_2" || slot.kind === "top_reel";
    const label = isInstagramSlot ? "post do Instagram" : (slot as ProductSourceSlot).title;
    imageParts.push({ type: "text", text: `Imagem da mensagem ${i + 1} (${label}):` });
    imageParts.push({ type: "image_url", image_url: { url: dataUri } });
  });

  const angles = pickAngles(count);

  let model = PREFERRED_MODEL;
  let items: DraftItem[];
  try {
    items = await requestBatchCompletion(apiKey, model, ctx, count, angles, imageParts);
  } catch (error) {
    console.error(`callOpenAiBatch: falha no modelo preferido (${PREFERRED_MODEL}), caindo pro fallback (${FALLBACK_MODEL}):`, error);
    model = FALLBACK_MODEL;
    items = await requestBatchCompletion(apiKey, model, ctx, count, angles, imageParts);
  }

  // O modelo nem sempre respeita "exatamente N itens" — já reproduzido em produção (pediu 7,
  // voltou 6, e o dia que sobrou some sem nenhum aviso). Tenta de novo 1x com o mesmo pedido antes
  // de aceitar um lote incompleto.
  if (items.length !== count) {
    try {
      const retry = await requestBatchCompletion(apiKey, model, ctx, count, angles, imageParts);
      if (retry.length === count) items = retry;
      else if (retry.length > items.length) items = retry;
    } catch {
      // mantém o resultado da primeira tentativa se a segunda falhar
    }
  }

  return { items, slotImageDataUris };
}

export type BatchMode = "day" | "week";

export async function generateAiContentBatch(input: {
  campaignId: string;
  campaignName: string;
  mode: BatchMode;
  startDate: string; // "YYYY-MM-DD"
  timeOfDay: string; // "HH:MM"
}): Promise<{ success: true; batchId: string; items: ContentQueueItem[] } | { success: false; error: string }> {
  const supabaseAdmin = await admin();
  const { data: settings } = await supabaseAdmin.from("store_settings").select("openai_api_key, ai_marketing_playbook").order("created_at", { ascending: true }).limit(1).maybeSingle();
  const apiKey = (settings as any)?.openai_api_key as string | undefined;
  if (!apiKey) return { success: false, error: "Configure a API key da OpenAI em Configurações antes de usar isso." };
  const playbook = (settings as any)?.ai_marketing_playbook as string | null;

  const count = input.mode === "week" ? 7 : 1;
  const scheduledDates = buildScheduledDates(input.startDate, count);
  const kinds = assignSlotKinds(scheduledDates);
  const batchId = crypto.randomUUID();

  const signals = await gatherWeeklySignals(input.startDate);

  const hasAnySignal = !!(signals.topSeller1 || signals.topSeller2 || signals.topVisited || signals.topPost1 || signals.topPost2 || signals.topReel);
  const hasCouponDay = kinds.includes("coupon");
  if (!hasAnySignal && !hasCouponDay) {
    return { success: false, error: "Nenhum produto vendido, produto acessado ou post do Instagram disponível na semana anterior pra basear o conteúdo." };
  }

  // Monta os slots finais dia a dia — o cupom é criado aqui (precisa da scheduledDate exata pra
  // saber a validade). Se a Shopify falhar, o dia cai pra uma das 6 fontes normais em vez de
  // travar o lote inteiro.
  const slots: ContentSlot[] = [];
  for (let i = 0; i < count; i++) {
    if (kinds[i] === "coupon") {
      const { createBatchCoupon } = await import("./ai-coupons.server");
      const couponRes = await createBatchCoupon({ scheduledDate: scheduledDates[i]!, batchId });
      if (couponRes.success) {
        const expiresAtLabel = new Date(couponRes.coupon.endsAt).toLocaleString("pt-BR", {
          timeZone: TZ,
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
        slots.push({
          kind: "coupon",
          code: couponRes.coupon.code,
          percentageLabel: `${Math.round(couponRes.coupon.percentage * 100)}%`,
          expiresAtLabel,
        });
      } else {
        console.error(`generateAiContentBatch: falha ao criar cupom Shopify (${couponRes.error}), caindo pra fonte alternativa no dia ${scheduledDates[i]}`);
        const fallback = NON_COUPON_KINDS.map((k) => slotForKind(k, signals)).find((s) => s !== null) ?? null;
        slots.push(fallback);
      }
    } else {
      slots.push(slotForKind(kinds[i] as NonCouponSlotKind, signals));
    }
  }

  const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const { data: recent } = await (supabaseAdmin.from("ai_content_queue" as any) as any)
    .select("content_text")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  const recentTexts = ((recent ?? []) as any[]).map((r) => r.content_text as string).slice(0, 10);

  let batchResult: { items: DraftItem[]; slotImageDataUris: (string | null)[] };
  try {
    batchResult = await callOpenAiBatch(apiKey, { slots, playbook, recentTexts }, count);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao gerar o lote com a OpenAI." };
  }

  const { uploadEnvioMedia } = await import("./envio-messages.server");
  const items: ContentQueueItem[] = [];

  for (let i = 0; i < batchResult.items.length; i++) {
    const draft = batchResult.items[i]!;
    const slot = slots[i] ?? null;

    const slotDataUri = batchResult.slotImageDataUris[i];
    let contentImageUrl: string | null = null;
    try {
      if ((draft.use_image === "product" || draft.use_image === "post") && slotDataUri) {
        contentImageUrl = (await uploadEnvioMedia({ fileName: `ai-batch-${Date.now()}-${i}.jpg`, base64Data: dataUriToBase64(slotDataUri), contentType: dataUriContentType(slotDataUri) })).url;
      } else if (draft.use_image === "generate" && draft.image_prompt) {
        const b64 = await generateImageBase64(apiKey, draft.image_prompt);
        contentImageUrl = (await uploadEnvioMedia({ fileName: `ai-batch-${Date.now()}-${i}.png`, base64Data: b64, contentType: "image/png" })).url;
      }
    } catch (error) {
      console.error(`generateAiContentBatch: falha ao preparar imagem do item ${i}, seguindo sem imagem:`, error);
    }

    let linkType: "instagram" | "site" | "none" = draft.link_type;
    let linkUrl: string | null = null;
    if (linkType === "instagram" && slot && (slot.kind === "top_post_1" || slot.kind === "top_post_2" || slot.kind === "top_reel")) {
      linkUrl = slot.permalink;
    } else if (linkType === "site" && slot && (slot.kind === "top_seller_1" || slot.kind === "top_seller_2" || slot.kind === "top_visited")) {
      linkUrl = slot.productUrl;
    }
    if (!linkUrl) linkType = "none";

    const scheduledDateStr = scheduledDates[i]!;

    const { data: inserted, error } = await (supabaseAdmin.from("ai_content_queue" as any) as any)
      .insert({
        batch_id: batchId,
        campaign_id: input.campaignId,
        campaign_name: input.campaignName,
        content_text: draft.message_text,
        content_image_url: contentImageUrl,
        link_type: linkType,
        link_url: linkUrl,
        source_summary: draft.source_summary,
        scheduled_date: scheduledDateStr,
        time_of_day: input.timeOfDay,
        status: "review",
      })
      .select("*")
      .single();

    if (error || !inserted) {
      console.error(`generateAiContentBatch: falha ao inserir item ${i}:`, error);
      continue;
    }

    let row = inserted;
    if (linkType !== "none" && linkUrl) {
      const trackedUrl = `${APP_BASE_URL}/r/${row.id}`;
      const finalText = `${draft.message_text}\n\n🔗 ${trackedUrl}`;
      const { data: updated } = await (supabaseAdmin.from("ai_content_queue" as any) as any)
        .update({ content_text: finalText, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .select("*")
        .single();
      if (updated) row = updated;
    }

    if (slot?.kind === "coupon") {
      const { associateCouponWithContentItem } = await import("./ai-coupons.server");
      await associateCouponWithContentItem(batchId, scheduledDateStr, row.id).catch((e) => console.error("generateAiContentBatch: falha ao associar cupom ao item de fila:", e));
    }

    items.push(mapRow(row));
  }

  if (items.length === 0) return { success: false, error: "Falha ao salvar os itens gerados." };
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

/** candidate e nowSP precisam ficar no MESMO "espaço" de representação (campos locais = hora de
 *  SP) antes de comparar — só converter pra instante UTC real via fromZonedTime no final, senão
 *  a comparação fica errada dependendo do fuso do runtime (mesma pegadinha de sempre com
 *  date-fns-tz, já resolvida direito em computeInitialNextRunAt de ai-send-routines.server.ts). */
function computeScheduledAt(scheduledDate: string, timeOfDay: string): Date {
  const [hh, mm] = timeOfDay.split(":").map(Number) as [number, number];
  const [y, m, d] = scheduledDate.split("-").map(Number) as [number, number, number];
  const nowSP = toZonedTime(new Date(), TZ);
  const candidate = new Date(y, m - 1, d, hh, mm, 0, 0);
  if (candidate <= nowSP) return new Date();
  return fromZonedTime(candidate, TZ);
}

async function approveOne(id: string): Promise<{ success: true } | { success: false; error: string }> {
  const supabaseAdmin = await admin();
  const { data: row } = await (supabaseAdmin.from("ai_content_queue" as any) as any).select("*").eq("id", id).eq("status", "review").maybeSingle();
  if (!row) return { success: false, error: "Item não encontrado ou já processado." };

  const scheduledAt = computeScheduledAt(row.scheduled_date, row.time_of_day);
  const isImmediate = scheduledAt.getTime() - Date.now() <= 60_000;

  try {
    const { messageIds } = await dispatchToCampaignGroups(row.campaign_id, row.content_text, row.content_image_url, isImmediate ? undefined : scheduledAt.toISOString());
    await (supabaseAdmin.from("ai_content_queue" as any) as any)
      .update({ status: "sent", envio_message_id: messageIds[0] ?? null, updated_at: new Date().toISOString() })
      .eq("id", id);
    return { success: true };
  } catch (error) {
    await (supabaseAdmin.from("ai_content_queue" as any) as any).update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", id);
    return { success: false, error: error instanceof Error ? error.message : "Falha ao despachar." };
  }
}

export async function approveContentQueueItem(id: string): Promise<{ success: true } | { success: false; error: string }> {
  return approveOne(id);
}

export async function approveContentQueueBatch(batchId: string): Promise<{ approved: number; failed: number }> {
  const supabaseAdmin = await admin();
  const { data } = await (supabaseAdmin.from("ai_content_queue" as any) as any).select("id").eq("batch_id", batchId).eq("status", "review");
  let approved = 0;
  let failed = 0;
  for (const row of (data ?? []) as any[]) {
    const res = await approveOne(row.id);
    if (res.success) approved++;
    else failed++;
  }
  return { approved, failed };
}

export async function rejectContentQueueItem(id: string): Promise<{ success: true }> {
  const supabaseAdmin = await admin();
  await (supabaseAdmin.from("ai_content_queue" as any) as any).update({ status: "rejected", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "review");
  return { success: true };
}

/** Fecha o lote inteiro sem aprovar nada — chamado quando o usuário fecha o popup ou clica em
 *  "Gerar outro lote" com itens ainda em revisão. Sem isso, os itens abandonados ficavam presos
 *  em status='review' pra sempre: nunca despachavam, mas também continuavam entrando no pool de
 *  "recentTexts" de gerações futuras como se fossem conteúdo válido/recente. */
export async function rejectContentQueueBatch(batchId: string): Promise<{ rejected: number }> {
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin.from("ai_content_queue" as any) as any)
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("batch_id", batchId)
    .eq("status", "review")
    .select("id");
  if (error) return { rejected: 0 };
  return { rejected: (data ?? []).length };
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
  const { data: sentItems } = await (supabaseAdmin.from("ai_content_queue" as any) as any).select("*").eq("status", "sent").gte("created_at", sinceIso);
  const items = ((sentItems ?? []) as any[]).filter((i) => i.envio_message_id);
  if (items.length === 0) return [];

  const messageIds = items.map((i) => i.envio_message_id as string);

  const [{ data: clicks }, { data: replies }, { data: feedback }, { data: envioMsgs }] = await Promise.all([
    (supabaseAdmin.from("envio_link_clicks" as any) as any).select("envio_message_id").in("envio_message_id", messageIds),
    (supabaseAdmin.from("envio_message_replies" as any) as any).select("envio_message_id").in("envio_message_id", messageIds),
    (supabaseAdmin.from("envio_message_feedback" as any) as any).select("envio_message_id, feedback").in("envio_message_id", messageIds),
    (supabaseAdmin.from("envio_messages" as any) as any).select("id, group_id, sent_at").in("id", messageIds),
  ]);

  const clicksByMsg = countBy((clicks ?? []) as any[], "envio_message_id");
  const repliesByMsg = countBy((replies ?? []) as any[], "envio_message_id");
  const feedbackByMsg = new Map(((feedback ?? []) as any[]).map((f) => [f.envio_message_id, f.feedback as "good" | "bad"]));
  const msgById = new Map(((envioMsgs ?? []) as any[]).map((m) => [m.id, m]));

  const groupIds = [...new Set(((envioMsgs ?? []) as any[]).map((m) => m.group_id).filter(Boolean))] as string[];
  let leaveEvents: any[] = [];
  if (groupIds.length > 0) {
    const { getLiveLaunchpadAdmin } = await import("@/integrations/supabase/live-launchpad-client.server");
    const liveLaunchpad = await getLiveLaunchpadAdmin();
    const { data } = await (liveLaunchpad.from("fe_group_events") as any).select("group_id, created_at").eq("event_type", "leave").in("group_id", groupIds);
    leaveEvents = data ?? [];
  }

  function churnFor(envioMessageId: string): number {
    const msg = msgById.get(envioMessageId);
    if (!msg?.sent_at) return 0;
    const sentAt = new Date(msg.sent_at).getTime();
    const windowEnd = sentAt + 24 * 3600_000;
    return leaveEvents.filter((e) => e.group_id === msg.group_id && new Date(e.created_at).getTime() >= sentAt && new Date(e.created_at).getTime() <= windowEnd).length;
  }

  return items.map((item) => ({
    id: item.id as string,
    campaignName: item.campaign_name as string,
    scheduledDate: item.scheduled_date as string,
    text: (item.content_text as string).slice(0, 200),
    clicks: clicksByMsg.get(item.envio_message_id) ?? 0,
    replies: repliesByMsg.get(item.envio_message_id) ?? 0,
    exits24h: churnFor(item.envio_message_id),
    feedback: feedbackByMsg.get(item.envio_message_id) ?? null,
  }));
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
