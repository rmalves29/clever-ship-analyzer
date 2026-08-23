import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { fetchImageAsDataUri, dataUriToBase64, dataUriContentType, generateImageBase64, dispatchToCampaignGroups } from "./ai-send-routines.server";

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
  use_image: "ad" | "post" | "generate" | "none";
  image_prompt: string | null;
  link_type: "instagram" | "site" | "none";
  source_summary: string;
};

type AdProduct = { name: string; cleanName: string; thumbnailUrl: string | null; roas: number; ctrLink: number; cpa: number };

type SignalsContext = {
  adProducts: AdProduct[];
  productSlots: (AdProduct | null)[];
  topPostYesterday: { caption: string | null; thumbnailUrl: string | null; permalink: string | null; reach: number; totalInteractions: number } | null;
  promotions: { title: string; summary: string | null; code: string | null }[];
  storeUrl: string | null;
  playbook: string | null;
  recentTexts: string[];
};

/** Deixar a diversidade só na mão da IA não é confiável — com os mesmos sinais de entrada
 *  (mesmo anúncio, mesmo post, mesmas promoções), o modelo tende a convergir pra respostas
 *  parecidas entre chamadas separadas, mesmo com temperature alta (reportado pelo usuário:
 *  cancelar e gerar de novo voltava com as mesmas mensagens). Forçar um ângulo diferente e
 *  sorteado por item, por chamada, garante diversidade mecânica em vez de só pedir por texto. */
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

/** Nomes de anúncio no Meta Ads costumam ter tags internas depois de "|" (público, objetivo,
 *  variante — ex: "Conjunto LUMIM | LTV") que não fazem sentido nenhum pro cliente final. Usado
 *  só como o nome "limpo" sugerido no prompt — a IA ainda recebe o nome bruto como referência,
 *  mas instruída a nunca citá-lo literalmente. */
function cleanAdName(raw: string): string {
  const first = raw.split("|")[0]?.trim();
  return first && first.length > 0 ? first : raw.trim();
}

/** Com só 1 produto real disponível (o de melhor ROAS), toda mensagem "concreta" acabava caindo
 *  nele — reportado pelo usuário como o lote inteiro girando em torno do mesmo conjunto, só com
 *  ângulos diferentes. Distribui um produto (ou nenhum, de propósito) por mensagem via rodízio —
 *  cada produto (e um slot "sem produto específico") aparece no máximo 1x antes de qualquer um
 *  repetir, em vez de deixar a escolha de assunto a cargo do modelo. */
function pickProductSlots(count: number, products: AdProduct[]): (AdProduct | null)[] {
  const pool: (AdProduct | null)[] = products.length > 0 ? [...products, null] : [null];
  const slots: (AdProduct | null)[] = [];
  let cycle: (AdProduct | null)[] = [];
  for (let i = 0; i < count; i++) {
    if (cycle.length === 0) cycle = [...pool].sort(() => Math.random() - 0.5);
    slots.push(cycle.shift()!);
  }
  return slots;
}

function buildBatchPrompt(ctx: SignalsContext, count: number, angles: string[]): string {
  const productLine = (p: AdProduct | null) =>
    p ? `Produto: "${p.cleanName}" (ROAS ${p.roas.toFixed(2)})` : `Produto: NENHUM específico — fale da marca/loja em geral, ou use uma promoção/post do Instagram abaixo se fizer sentido; NÃO force menção a nenhum produto de anúncio nessa mensagem`;

  return `Você é um copywriter de e-commerce especialista em WhatsApp pra grupos (moda feminina, loja "Mania de Mulher"). Escreva ${count} mensage${count > 1 ? "ns" : "m"} DIFERENTE${count > 1 ? "S" : ""} pra disparar em grupos de WhatsApp, uma por dia.

CONFIGURAÇÃO OBRIGATÓRIA DE CADA MENSAGEM (mensagem 1 = item 1 do array JSON, etc — siga essa ordem e essa atribuição à risca, nunca troque):
${angles.map((a, i) => `${i + 1}. Ângulo: ${a} — ${productLine(ctx.productSlots[i] ?? null)}`).join("\n")}

REGRAS OBRIGATÓRIAS:
- Siga o ângulo E o produto designado de cada mensagem à risca — é isso que garante que o lote não saia parecido (nem sempre sobre o mesmo produto), e que gerar de novo não volte com as mesmas mensagens de antes.
- Use gatilhos mentais de verdade (escassez, urgência, prova social, curiosidade, benefício claro) — sem exagero forçado, sem soar robótico.
- Quando a mensagem tiver um produto designado, seja CONCRETO sobre ele (cite o nome natural do produto, o que o torna especial) em vez de frases vagas tipo "nossos acessórios", "seu look" que servem pra qualquer loja. Quando o produto designado for "nenhum específico", tudo bem ser mais genérico de marca, ou usar uma promoção/o post do Instagram se houver.
- Máximo 4 linhas por mensagem, emoji com moderação.
- Se fizer sentido citar o post recente do Instagram (${ctx.topPostYesterday ? "existe um disponível abaixo" : "NÃO há post disponível — não cite Instagram"}), marque essa mensagem com "link_type":"instagram".
- Se fizer sentido citar uma promoção do site (${ctx.promotions.length > 0 || ctx.storeUrl ? "existe informação abaixo" : "sem dado de site disponível — não cite"}), marque com "link_type":"site".
- Nem toda mensagem precisa ter link — varie isso também.
- NUNCA escreva a URL literal no texto — só o convite claro ("responde aqui", "corre no link abaixo", "olha nosso Instagram") — o link real é adicionado depois, fora do seu texto.
- NUNCA cite o nome interno de um anúncio literalmente. Nomes de anúncio no Meta Ads têm tags internas tipo "| LTV", "| Story", "| Conv" que são só rótulos de organização de campanha, não o nome real do produto pro cliente. Use sempre o nome natural já dado em "Produto:" na configuração de cada mensagem.
- Imagens de produto (anexadas abaixo, cada uma rotulada com o nome do produto) são fotos REAIS de um produto específico. Só marque "use_image":"ad" se a mensagem tiver um produto designado (não "nenhum específico") — nesse caso a imagem certa é resolvida automaticamente pelo produto atribuído a ela, então só decida "ad" vs "generate" vs "none" vs "post", sem se preocupar em escolher QUAL foto. Se o produto designado da mensagem for "nenhum específico", NUNCA use "ad" — use "generate" (descrevendo no image_prompt algo condizente com o que a mensagem está vendendo) ou "none". Mesma regra pro post do Instagram: só use "use_image":"post" se a mensagem citar exatamente esse post.

${ctx.playbook ? `O QUE JÁ SABEMOS QUE FUNCIONA (aprendizado de mensagens anteriores — use como direção estratégica, NÃO copie frases):\n${ctx.playbook}\n` : ""}
${ctx.recentTexts.length > 0 ? `MENSAGENS JÁ ENVIADAS RECENTEMENTE (NÃO repita a estrutura/abertura destas):\n${ctx.recentTexts.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n` : ""}

PRODUTOS/ANÚNCIOS DISPONÍVEIS (ROAS dos últimos 30 dias — imagens reais anexadas abaixo, uma por produto):
${ctx.adProducts.length > 0 ? ctx.adProducts.map((p) => `- "${p.cleanName}" — ROAS ${p.roas.toFixed(2)}, CTR ${(p.ctrLink * 100).toFixed(2)}%, CPA R$${p.cpa.toFixed(2)}`).join("\n") : "nenhum disponível"}

MELHOR POST DO INSTAGRAM DE ONTEM:
${ctx.topPostYesterday ? `"${ctx.topPostYesterday.caption ?? "(sem legenda)"}" — alcance ${ctx.topPostYesterday.reach}, ${ctx.topPostYesterday.totalInteractions} interações${ctx.topPostYesterday.thumbnailUrl ? " (imagem em anexo)" : ""}` : "nenhum post ontem"}

PROMOÇÕES ATIVAS AGORA NO SITE:
${ctx.promotions.length > 0 ? ctx.promotions.map((p) => `- ${p.title}${p.summary ? `: ${p.summary}` : ""}${p.code ? ` (cupom ${p.code})` : ""}`).join("\n") : "nenhuma promoção ativa detectada"}

Responda em JSON estrito, um array com exatamente ${count} item(ns):
{ "items": [ { "message_text": string, "use_image": "ad"|"post"|"generate"|"none", "image_prompt": string|null, "link_type": "instagram"|"site"|"none", "source_summary": string (1 frase curta) } ] }`;
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
): Promise<{ items: DraftItem[]; productDataUriByName: Map<string, string>; postDataUri: string | null }> {
  const [productDataUris, postDataUri] = await Promise.all([
    Promise.all(ctx.adProducts.map((p) => (p.thumbnailUrl ? fetchImageAsDataUri(p.thumbnailUrl) : Promise.resolve(null)))),
    ctx.topPostYesterday?.thumbnailUrl ? fetchImageAsDataUri(ctx.topPostYesterday.thumbnailUrl) : Promise.resolve(null),
  ]);
  const productDataUriByName = new Map<string, string>();
  const imageParts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
  ctx.adProducts.forEach((p, i) => {
    const dataUri = productDataUris[i];
    if (!dataUri) return;
    productDataUriByName.set(p.name, dataUri);
    imageParts.push({ type: "text", text: `Imagem do produto "${p.cleanName}":` });
    imageParts.push({ type: "image_url", image_url: { url: dataUri } });
  });
  if (postDataUri) {
    imageParts.push({ type: "text", text: "Imagem do post do Instagram de ontem:" });
    imageParts.push({ type: "image_url", image_url: { url: postDataUri } });
  }

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

  return { items, productDataUriByName, postDataUri };
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

  const { getMetaAdsCreatives } = await import("./meta-ads.server");
  const { getInstagramTopContent } = await import("./instagram.server");
  const { getActiveShopifyPromotions, getShopifyStoreUrl } = await import("./shopify.server");

  const [adsRes, igRes, promoRes, storeUrl] = await Promise.all([
    getMetaAdsCreatives("last_30d").catch(() => ({ success: false as const, error: "" })),
    getInstagramTopContent("yesterday").catch(() => ({ success: false as const, error: "" })),
    getActiveShopifyPromotions().catch(() => ({ success: false as const, error: "" })),
    getShopifyStoreUrl().catch(() => null),
  ]);

  // Antes só usava o anúncio de melhor ROAS (1 produto só) — todo o lote acabava girando em torno
  // dele, só com ângulo diferente. Agora pega até 3 produtos distintos (deduplicados pelo nome
  // limpo, pra duas variantes do mesmo anúncio não contarem como produtos diferentes) e distribui
  // um por mensagem via pickProductSlots, incluindo slots "sem produto específico" de propósito.
  const adProducts: AdProduct[] = [];
  if (adsRes.success) {
    const seenNames = new Set<string>();
    const ranked = [...adsRes.result.creatives].filter((c) => c.roas > 0 && c.purchases > 0).sort((a, b) => b.roas - a.roas);
    for (const c of ranked) {
      const clean = cleanAdName(c.name);
      if (seenNames.has(clean)) continue;
      seenNames.add(clean);
      adProducts.push({ name: c.name, cleanName: clean, thumbnailUrl: c.thumbnailUrl, roas: c.roas, ctrLink: c.ctrLink, cpa: c.cpa });
      if (adProducts.length >= 3) break;
    }
  }

  const topPostYesterday = igRes.success && igRes.media.length > 0
    ? [...igRes.media].sort((a, b) => b.totalInteractions - a.totalInteractions).slice(0, 1).map((m) => ({
        caption: m.caption,
        thumbnailUrl: m.thumbnailUrl,
        permalink: m.permalink,
        reach: m.reach,
        totalInteractions: m.totalInteractions,
      }))[0]!
    : null;

  const promotions = promoRes.success ? promoRes.promotions : [];

  const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const { data: recent } = await (supabaseAdmin.from("ai_content_queue" as any) as any)
    .select("content_text")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  const recentTexts = ((recent ?? []) as any[]).map((r) => r.content_text as string).slice(0, 10);

  if (adProducts.length === 0 && !topPostYesterday && promotions.length === 0) {
    return { success: false, error: "Nenhum anúncio, post do Instagram de ontem ou promoção ativa disponível pra basear o conteúdo." };
  }

  const productSlots = pickProductSlots(count, adProducts);

  let batchResult: { items: DraftItem[]; productDataUriByName: Map<string, string>; postDataUri: string | null };
  try {
    batchResult = await callOpenAiBatch(apiKey, { adProducts, productSlots, topPostYesterday, promotions, storeUrl, playbook, recentTexts }, count);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao gerar o lote com a OpenAI." };
  }

  const { uploadEnvioMedia } = await import("./envio-messages.server");
  const batchId = crypto.randomUUID();
  const [startYear, startMonth, startDay] = input.startDate.split("-").map(Number) as [number, number, number];
  const items: ContentQueueItem[] = [];

  for (let i = 0; i < batchResult.items.length; i++) {
    const draft = batchResult.items[i]!;
    const assignedProduct = productSlots[i] ?? null;

    // Rede de segurança: mesmo com a instrução no prompt, se o texto ainda vier com o nome
    // interno cru de algum anúncio (ex: "Conjunto LUMIM | LTV"), troca pelo nome limpo.
    for (const p of adProducts) {
      if (draft.message_text.includes(p.name)) {
        draft.message_text = draft.message_text.split(p.name).join(p.cleanName);
      }
    }

    // A imagem do produto é resolvida pelo produto ATRIBUÍDO a essa mensagem (pickProductSlots),
    // não por uma escolha livre da IA — garante que a foto batha com o que a mensagem descreve.
    const assignedProductDataUri = assignedProduct ? batchResult.productDataUriByName.get(assignedProduct.name) : undefined;

    let contentImageUrl: string | null = null;
    try {
      if (draft.use_image === "ad" && assignedProductDataUri) {
        contentImageUrl = (await uploadEnvioMedia({ fileName: `ai-batch-${Date.now()}-${i}.jpg`, base64Data: dataUriToBase64(assignedProductDataUri), contentType: dataUriContentType(assignedProductDataUri) })).url;
      } else if (draft.use_image === "post" && batchResult.postDataUri) {
        contentImageUrl = (await uploadEnvioMedia({ fileName: `ai-batch-${Date.now()}-${i}.jpg`, base64Data: dataUriToBase64(batchResult.postDataUri), contentType: dataUriContentType(batchResult.postDataUri) })).url;
      } else if (draft.use_image === "generate" && draft.image_prompt) {
        const b64 = await generateImageBase64(apiKey, draft.image_prompt);
        contentImageUrl = (await uploadEnvioMedia({ fileName: `ai-batch-${Date.now()}-${i}.png`, base64Data: b64, contentType: "image/png" })).url;
      }
    } catch (error) {
      console.error(`generateAiContentBatch: falha ao preparar imagem do item ${i}, seguindo sem imagem:`, error);
    }

    let linkType: "instagram" | "site" | "none" = draft.link_type;
    let linkUrl: string | null = null;
    if (linkType === "instagram") {
      linkUrl = topPostYesterday?.permalink ?? null;
      if (!linkUrl) linkType = "none";
    } else if (linkType === "site") {
      linkUrl = storeUrl;
      if (!linkUrl) linkType = "none";
    }

    const scheduledDate = new Date(startYear, startMonth - 1, startDay + i);
    const scheduledDateStr = `${scheduledDate.getFullYear()}-${String(scheduledDate.getMonth() + 1).padStart(2, "0")}-${String(scheduledDate.getDate()).padStart(2, "0")}`;

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
