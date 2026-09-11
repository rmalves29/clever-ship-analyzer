/**
 * Motor único das campanhas de WhatsApp (Meta Cloud API).
 *
 * Três responsabilidades, três tabelas:
 *   wa_campaigns            -> a campanha (público, modelo, agendamento, contadores)
 *   wa_campaign_recipients  -> um registro por cliente (situação real da mensagem)
 *   wa_jobs                 -> apenas a fila de trabalho do worker
 *
 * Nenhum outro ponto do sistema deve chamar a Meta diretamente para campanhas.
 */

import type { SegmentType } from "./crm-mock";
import { resolveAutomationBodyParams, type AutomationEventContext } from "./whatsapp-automation-context";
import { buildDirectCheckoutUrl } from "./shopify-cart-permalink";

export const CAMPAIGNS_TABLE = "wa_campaigns";
export const RECIPIENTS_TABLE = "wa_campaign_recipients";
export const JOBS_TABLE = "wa_jobs";
export const JOBS_CLAIM_RPC = "claim_wa_jobs";

const RETRY_BACKOFF_MINUTES = [5, 30, 120];
const DEFAULT_MAX_ATTEMPTS = 3;

export const RECIPIENT_STATUSES = ["queued", "sending", "sent", "delivered", "read", "failed", "cancelled"] as const;
export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number];

export type JobRow = {
  id: string;
  campaign_id: string;
  recipient_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  priority: number;
  scheduled_at: string;
  next_attempt_at: string | null;
  error: string | null;
};

export type RecipientRow = {
  id: string;
  campaign_id: string;
  customer_id: string | null;
  name: string | null;
  phone: string;
  params: string[] | null;
  status: RecipientStatus;
  wa_message_id: string | null;
  error_code: string | null;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
};

export type CampaignRow = {
  id: string;
  name: string;
  status: string;
  origin: string;
  audience_kind: string;
  audience_id: string | null;
  audience_label: string | null;
  template_name: string;
  template_language: string;
  message_type: string;
  body_params: string[] | null;
  body_param_tokens: string[] | null;
  header_media_url: string | null;
  coupon_code: string | null;
  campaign_tag: string | null;
  automation_id: string | null;
  automation_step_id: string | null;
  conversation_flow_id: string | null;
  conversation_flow_step_id: string | null;
  queue_paused: boolean;
  scheduled_at: string | null;
  sent_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
  last_error: string | null;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  created_at: string;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as {
    from: (t: string) => any;
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function backoffFor(attempts: number): string {
  const idx = Math.min(Math.max(attempts - 1, 0), RETRY_BACKOFF_MINUTES.length - 1);
  const minutes = RETRY_BACKOFF_MINUTES[idx] ?? 120;
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function isValidMediaUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value) && !value.includes("placeholder") && !value.includes("undefined");
}

/** Substitui os tokens do corpo do template pelos valores reais enviados — pra registrar
 *  na caixa de entrada o texto de verdade que o cliente recebeu. */
export function renderTemplateBody(bodyText: string, bodyParams: string[], bodyParamTokens: string[] | null | undefined): string {
  return bodyText.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, token: string) => {
    if (bodyParamTokens && bodyParamTokens.length > 0) {
      const idx = bodyParamTokens.indexOf(token);
      return idx >= 0 && bodyParams[idx] !== undefined ? bodyParams[idx] : match;
    }
    const idx = Number(token) - 1;
    return Number.isInteger(idx) && bodyParams[idx] !== undefined ? bodyParams[idx] : match;
  });
}

// ---------------------------------------------------------------------------
// Resolução de variáveis (tokens dinâmicos) no momento do enfileiramento
// ---------------------------------------------------------------------------

function formatPurchasedItems(items: any[]): string {
  if (!items.length) return "—";
  const visible = items.slice(0, 4).map((item) => {
    const quantity = Math.max(1, Number(item.quantity ?? 1));
    const title = String(item.title ?? "Produto").trim();
    const variant = String(item.variant_title ?? "").trim();
    return `${quantity}x ${title}${variant ? ` (${variant})` : ""}`;
  });
  const remaining = items.length - visible.length;
  return remaining > 0 ? `${visible.join(", ")} + ${remaining} item(ns)` : visible.join(", ");
}

function firstDiscountCode(rawData: any): string {
  const snake = rawData?.discount_codes?.[0];
  if (typeof snake === "string") return snake;
  if (snake?.code) return String(snake.code);
  const camel = rawData?.discountCodes?.[0];
  if (typeof camel === "string") return camel;
  if (camel?.code) return String(camel.code);
  return "—";
}

function shippingTitle(rawData: any): string {
  return rawData?.shipping_lines?.[0]?.title || rawData?.shippingLine?.title || rawData?.shippingLines?.edges?.[0]?.node?.title || "—";
}

type OrderBundle = {
  order: any;
  items: any[];
  fulfillment: any;
  storefrontDomain: string | null;
  cashback: Awaited<ReturnType<typeof import("./cashback.server")["loadCashbackForOrder"]>>;
};

/** Carrega em LOTE o último pedido + itens + rastreio + cashback de todos os destinatários.
 *  Sem isso, resolver tokens por destinatário faria 3–4 queries por pessoa. */
async function preloadOrderBundles(customerIds: string[]): Promise<Map<string, OrderBundle>> {
  const result = new Map<string, OrderBundle>();
  const ids = [...new Set(customerIds.filter(Boolean))];
  if (ids.length === 0) return result;
  const supabaseAdmin = await admin();

  const { data: settingsRow } = await supabaseAdmin
    .from("store_settings")
    .select("storefront_domain")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const storefrontDomain = (settingsRow as { storefront_domain: string | null } | null)?.storefront_domain ?? null;

  const latestByCustomer = new Map<string, any>();
  for (const part of chunk(ids, 200)) {
    const { data } = await supabaseAdmin
      .from("shopify_orders")
      .select("id, customer_id, processed_at, order_number, name, total_price, fulfillment_status, raw_data")
      .in("customer_id", part)
      .order("processed_at", { ascending: false });
    for (const row of (data ?? []) as any[]) {
      if (!latestByCustomer.has(row.customer_id)) latestByCustomer.set(row.customer_id, row);
    }
  }

  const orderIds = [...latestByCustomer.values()].map((o) => String(o.id));
  const itemsByOrder = new Map<string, any[]>();
  const fulfillmentByOrder = new Map<string, any>();
  const cashbackByOrder = new Map<string, OrderBundle["cashback"]>();

  for (const part of chunk(orderIds, 200)) {
    const [{ data: itemRows }, { data: fulfillmentRows }, { data: cashbackRows }] = await Promise.all([
      supabaseAdmin.from("shopify_order_items").select("order_id, title, variant_title, variant_id, quantity").in("order_id", part),
      supabaseAdmin
        .from("shopify_fulfillments")
        .select("order_id, tracking_number, tracking_url, tracking_company, status, updated_at")
        .in("order_id", part)
        .order("updated_at", { ascending: false }),
      supabaseAdmin
        .from("cashback_coupons")
        .select("shopify_order_id, code, cashback_amount, minimum_purchase, starts_at, ends_at, status")
        .in("shopify_order_id", part),
    ]);
    for (const row of (itemRows ?? []) as any[]) {
      const list = itemsByOrder.get(String(row.order_id)) ?? [];
      list.push(row);
      itemsByOrder.set(String(row.order_id), list);
    }
    for (const row of (fulfillmentRows ?? []) as any[]) {
      if (!fulfillmentByOrder.has(String(row.order_id))) fulfillmentByOrder.set(String(row.order_id), row);
    }
    for (const row of (cashbackRows ?? []) as any[]) {
      if (row.status === "cancelled") continue;
      cashbackByOrder.set(String(row.shopify_order_id), {
        code: String(row.code),
        amount: Number(row.cashback_amount ?? 0),
        minimumPurchase: Number(row.minimum_purchase ?? 0),
        startsAt: String(row.starts_at),
        endsAt: String(row.ends_at),
      });
    }
  }

  for (const [customerId, order] of latestByCustomer) {
    const key = String(order.id);
    result.set(customerId, {
      order,
      items: itemsByOrder.get(key) ?? [],
      fulfillment: fulfillmentByOrder.get(key) ?? null,
      storefrontDomain,
      cashback: cashbackByOrder.get(key) ?? null,
    });
  }
  return result;
}

async function resolveBodyParams(
  bodyParams: string[],
  recipient: { id: string; first_name?: string | null; checkout_url?: string | null },
  frozenContext?: AutomationEventContext,
  bundle?: OrderBundle,
): Promise<string[]> {
  if (!bodyParams.some((p) => p.includes("{{"))) return [...bodyParams];
  if (frozenContext) {
    return resolveAutomationBodyParams(bodyParams, frozenContext, {
      firstName: recipient.first_name,
      checkoutUrl: recipient.checkout_url,
    });
  }

  const order = bundle?.order ?? null;
  const rawData = order?.raw_data as any;
  const purchasedItems: any[] = bundle?.items ?? [];
  const fulfillment: any = bundle?.fulfillment ?? null;
  const cashback = bundle?.cashback ?? null;

  const brl = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));

  const trackingNumber = fulfillment?.tracking_number || "—";
  const trackingUrl = fulfillment?.tracking_url || "—";
  const fulfillmentStatus = String(fulfillment?.status ?? order?.fulfillment_status ?? "").toLowerCase();
  const isSent = Boolean(fulfillment?.tracking_number) || ["success", "fulfilled", "in_transit"].includes(fulfillmentStatus);
  const replacements: Record<string, string> = {
    "{{NOME_CLIENTE}}": recipient.first_name || "Cliente",
    "{{NUMERO_PEDIDO}}": order?.order_number || order?.name || "—",
    "{{VALOR_TOTAL}}": order?.total_price ? brl(order.total_price) : "—",
    "{{ITENS_COMPRADOS}}": formatPurchasedItems(purchasedItems),
    "{{CUPOM_DESCONTO}}": firstDiscountCode(rawData),
    "{{FRETE_ESCOLHIDO}}": shippingTitle(rawData),
    "{{RASTREIO}}": trackingNumber,
    "{{LINK_RASTREIO}}": trackingUrl,
    "{{STATUS_PEDIDO}}": isSent ? "Enviado" : "Processando",
    "{{LINK_CHECKOUT}}": recipient.checkout_url || "—",
    "{{LINK_PAGAMENTO}}":
      buildDirectCheckoutUrl(
        bundle?.storefrontDomain,
        purchasedItems.map((it: any) => ({ variantId: it.variant_id, quantity: Number(it.quantity ?? 1) })),
      ) || "—",
    "{{CUPOM_CASHBACK}}": cashback?.code || "—",
    "{{VALOR_CASHBACK}}": cashback ? brl(cashback.amount) : "—",
    "{{COMPRA_MINIMA_CASHBACK}}": cashback ? brl(cashback.minimumPurchase) : "—",
    "{{VALIDADE_CASHBACK}}": cashback?.endsAt
      ? new Date(cashback.endsAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
      : "—",
  };

  return bodyParams.map((param) => {
    let text = param;
    for (const [key, value] of Object.entries(replacements)) {
      text = text.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), value);
    }
    return text;
  });
}

function normalizeScheduledAt(value: string | undefined): { success: true; iso: string; future: boolean } | { success: false; error: string } {
  if (!value) return { success: true, iso: new Date().toISOString(), future: false };
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { success: false, error: "Data de agendamento inválida." };
  return { success: true, iso: date.toISOString(), future: date.getTime() > Date.now() + 5_000 };
}

// ---------------------------------------------------------------------------
// Enfileiramento
// ---------------------------------------------------------------------------

/** Materializa os destinatários da campanha e cria os jobs de envio. */
export async function enqueueCampaign(
  campaignId: string,
  restrictToCustomerIds?: string[],
  options?: { scheduledAt?: string; priority?: number },
) {
  const supabaseAdmin = await admin();
  const { loadSettings, getSegmentCustomerIds, resolveSegmentRecipients, toE164 } = await import("./whatsapp-meta.server");

  const { data: campaignRow } = await supabaseAdmin.from(CAMPAIGNS_TABLE).select("*").eq("id", campaignId).maybeSingle();
  if (!campaignRow) return { success: false as const, error: "Campanha não encontrada." };

  const settings = await loadSettings();
  if (!settings.accessToken || !settings.phoneNumberId) {
    return { success: false as const, error: "Credenciais do WhatsApp (Meta) não configuradas." };
  }

  const schedule = normalizeScheduledAt(options?.scheduledAt);
  if (!schedule.success) return { success: false as const, error: schedule.error };

  const campaign = campaignRow as CampaignRow;
  const bodyParams: string[] = Array.isArray(campaign.body_params) ? campaign.body_params : [];
  const bodyParamTokens: string[] | null = Array.isArray(campaign.body_param_tokens) ? campaign.body_param_tokens : null;
  const audienceType = campaign.audience_label ?? "todos";
  const ids = restrictToCustomerIds
    ? [...new Set(restrictToCustomerIds)]
    : await getSegmentCustomerIds(audienceType as SegmentType, campaign.audience_id || undefined);
  const recipients = (await resolveSegmentRecipients(audienceType, ids)) as Array<{
    id: string;
    phone: string;
    first_name?: string | null;
    checkout_url?: string | null;
    video_url?: string | null;
  }>;

  let frozenContexts = new Map<string, AutomationEventContext>();
  if (campaign.origin === "automacao") {
    const { loadAutomationContextsForCampaign } = await import("./whatsapp-automation-context.server");
    frozenContexts = await loadAutomationContextsForCampaign(campaignId);
  }

  const needsOrderTokens = bodyParams.some((p) => p.includes("{{"));
  const bundles = needsOrderTokens
    ? await preloadOrderBundles(recipients.filter((r) => !frozenContexts.has(r.id)).map((r) => r.id))
    : new Map<string, OrderBundle>();

  const scheduledAt = schedule.iso;
  const rows: Record<string, unknown>[] = [];
  const mediaByPhone = new Map<string, string>();
  let skipped = 0;

  for (const recipient of recipients) {
    const to = toE164(recipient.phone);
    if (!to) {
      skipped++;
      continue;
    }
    // Automações reaproveitam a mesma campanha, então cada novo pedido/checkout precisa ser um
    // registro próprio — event_key garante isso sem abrir brecha pra duplicidade do mesmo evento.
    const context = frozenContexts.get(recipient.id);
    const eventKey = String(context?.order?.id ?? context?.checkout?.id ?? "");
    if (isValidMediaUrl(recipient.video_url)) mediaByPhone.set(to, recipient.video_url);
    rows.push({
      campaign_id: campaignId,
      customer_id: recipient.id ?? null,
      name: recipient.first_name ?? null,
      phone: to,
      event_key: eventKey,
      params: await resolveBodyParams(bodyParams, recipient, context, bundles.get(recipient.id)),
      status: "queued" satisfies RecipientStatus,
    });
  }

  const insertedIds: { id: string }[] = [];
  for (const part of chunk(rows, 200)) {
    const { data, error } = await supabaseAdmin
      .from(RECIPIENTS_TABLE)
      .upsert(part, { onConflict: "campaign_id,phone,event_key", ignoreDuplicates: true })
      .select("id");
    if (error) {
      console.error("[enqueueCampaign] falha ao gravar destinatários", { campaignId, error: error.message });
      return { success: false as const, error: error.message };
    }
    insertedIds.push(...((data ?? []) as { id: string }[]));
  }

  const jobRows = insertedIds.map((r) => ({
    campaign_id: campaignId,
    recipient_id: r.id,
    status: "queued",
    attempts: 0,
    max_attempts: DEFAULT_MAX_ATTEMPTS,
    priority: options?.priority ?? 5,
    scheduled_at: scheduledAt,
    next_attempt_at: scheduledAt,
  }));

  let queued = 0;
  for (const part of chunk(jobRows, 200)) {
    const { error } = await supabaseAdmin.from(JOBS_TABLE).upsert(part, { onConflict: "recipient_id", ignoreDuplicates: true });
    if (error) {
      console.error("[enqueueCampaign] falha ao criar jobs", { campaignId, error: error.message });
      return { success: false as const, error: error.message };
    }
    queued += part.length;
  }

  // Mídia do cabeçalho, quando existe, é a mesma pra campanha inteira nos casos reais.
  const headerMediaUrl = mediaByPhone.size > 0 ? [...mediaByPhone.values()][0]! : campaign.header_media_url;

  if (queued === 0) {
    const alreadyQueued = await countPendingJobs(campaignId);
    if (alreadyQueued === 0) {
      console.error("[enqueueCampaign] nenhuma mensagem enfileirada", { campaignId, recipients: recipients.length, skipped });
      await supabaseAdmin.from(CAMPAIGNS_TABLE).update({ status: "cancelada" }).eq("id", campaignId);
      return {
        success: false as const,
        error:
          recipients.length === 0
            ? "Nenhum destinatário válido foi encontrado para esse público."
            : `Nenhum telefone válido entre os ${recipients.length} destinatários (${skipped} descartados).`,
      };
    }
  }

  await supabaseAdmin
    .from(CAMPAIGNS_TABLE)
    .update({
      status: schedule.future ? "agendada" : "enviando",
      scheduled_at: schedule.future ? scheduledAt : null,
      header_media_url: headerMediaUrl ?? null,
    })
    .eq("id", campaignId);

  return { success: true as const, campaignId, queued, skipped, total: recipients.length, scheduledAt };
}

async function countPendingJobs(campaignId: string): Promise<number> {
  const supabaseAdmin = await admin();
  const { count } = await supabaseAdmin
    .from(JOBS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", ["queued", "retry_wait", "sending"]);
  return count ?? 0;
}

export async function cancelCampaignQueue(campaignId: string) {
  const supabaseAdmin = await admin();
  const { data: jobs } = await supabaseAdmin
    .from(JOBS_TABLE)
    .select("recipient_id")
    .eq("campaign_id", campaignId)
    .in("status", ["queued", "retry_wait"]);
  const recipientIds = ((jobs ?? []) as { recipient_id: string }[]).map((j) => j.recipient_id);

  const { error } = await supabaseAdmin
    .from(JOBS_TABLE)
    .update({ status: "cancelled", error: "cancelado pelo painel" })
    .eq("campaign_id", campaignId)
    .in("status", ["queued", "retry_wait"]);
  if (error) return { success: false as const, error: error.message };

  for (const part of chunk(recipientIds, 200)) {
    await supabaseAdmin.from(RECIPIENTS_TABLE).update({ status: "cancelled" }).in("id", part);
  }
  await refreshCampaignStatus(campaignId);
  return { success: true as const, cancelled: recipientIds.length };
}

/** Recoloca na fila os destinatários que falharam. */
export async function retryFailedRecipients(campaignId: string) {
  const supabaseAdmin = await admin();
  const { data: failed } = await supabaseAdmin.from(RECIPIENTS_TABLE).select("id").eq("campaign_id", campaignId).eq("status", "failed");
  const ids = ((failed ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return { success: true as const, requeued: 0 };

  const now = new Date().toISOString();
  for (const part of chunk(ids, 200)) {
    await supabaseAdmin.from(RECIPIENTS_TABLE).update({ status: "queued", error_code: null, error_message: null }).in("id", part);
    await supabaseAdmin.from(JOBS_TABLE).delete().in("recipient_id", part);
    await supabaseAdmin.from(JOBS_TABLE).insert(
      part.map((recipientId) => ({
        campaign_id: campaignId,
        recipient_id: recipientId,
        status: "queued",
        attempts: 0,
        max_attempts: DEFAULT_MAX_ATTEMPTS,
        priority: 5,
        scheduled_at: now,
        next_attempt_at: now,
      })),
    );
  }
  await supabaseAdmin.from(CAMPAIGNS_TABLE).update({ status: "enviando", last_error: null }).eq("id", campaignId);
  return { success: true as const, requeued: ids.length };
}

/** Situação agregada da campanha, calculada a partir da fila e dos destinatários reais. */
export async function refreshCampaignStatus(campaignId: string) {
  const supabaseAdmin = await admin();
  const [{ data: jobRows }, { data: campaignRow }] = await Promise.all([
    supabaseAdmin.from(JOBS_TABLE).select("status, scheduled_at, error").eq("campaign_id", campaignId),
    supabaseAdmin.from(CAMPAIGNS_TABLE).select("total_recipients, sent_count, failed_count").eq("id", campaignId).maybeSingle(),
  ]);
  if (!campaignRow) return null;

  const jobs = (jobRows ?? []) as { status: string; scheduled_at: string; error: string | null }[];
  const counters = campaignRow as { total_recipients: number; sent_count: number; failed_count: number };
  const pendingJobs = jobs.filter((j) => ["queued", "retry_wait", "sending"].includes(j.status));
  const cancelled = jobs.filter((j) => j.status === "cancelled").length;
  const sent = counters.sent_count ?? 0;
  const failed = counters.failed_count ?? 0;
  const total = counters.total_recipients ?? 0;

  const stillScheduled =
    sent === 0 && pendingJobs.length > 0 && pendingJobs.every((j) => new Date(j.scheduled_at).getTime() > Date.now());
  const allFailed = pendingJobs.length === 0 && sent === 0 && failed > 0;
  const status = stillScheduled
    ? "agendada"
    : pendingJobs.length > 0
      ? "enviando"
      : allFailed
        ? "erro"
        : cancelled > 0 && sent === 0
          ? "cancelada"
          : "finalizada";

  let mostCommonError: string | null = null;
  if (failed > 0) {
    const { data: errorRows } = await supabaseAdmin
      .from(RECIPIENTS_TABLE)
      .select("error_message")
      .eq("campaign_id", campaignId)
      .eq("status", "failed")
      .limit(500);
    const counts = new Map<string, number>();
    for (const row of (errorRows ?? []) as { error_message: string | null }[]) {
      if (!row.error_message) continue;
      counts.set(row.error_message, (counts.get(row.error_message) ?? 0) + 1);
    }
    let top = 0;
    for (const [message, count] of counts) {
      if (count > top) {
        top = count;
        mostCommonError = message;
      }
    }
  }

  const { data: lastSent } = await supabaseAdmin
    .from(RECIPIENTS_TABLE)
    .select("sent_at")
    .eq("campaign_id", campaignId)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabaseAdmin
    .from(CAMPAIGNS_TABLE)
    .update({
      status,
      last_error: status === "erro" ? mostCommonError : null,
      ...(pendingJobs.length === 0 && (lastSent as { sent_at: string } | null)?.sent_at
        ? { sent_at: (lastSent as { sent_at: string }).sent_at }
        : {}),
    })
    .eq("id", campaignId);

  return { status, sent, failed, cancelled, pending: pendingJobs.length, total };
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export async function processWhatsappQueueBatch(options?: {
  limit?: number;
  workerId?: string;
  dryRun?: boolean;
  provider?: "meta" | "mock";
}) {
  const supabaseAdmin = await admin();
  const { loadSettings, sendTemplateMessage } = await import("./whatsapp-meta.server");
  const limit = options?.limit ?? 100;
  const dryRun = options?.dryRun === true;
  const useMock = options?.provider === "mock";
  const workerId = options?.workerId ?? `${useMock ? "mock" : dryRun ? "dryrun" : "worker"}-${Math.random().toString(36).slice(2, 10)}`;

  const settings = await loadSettings();
  if (!useMock && (!settings.accessToken || !settings.phoneNumberId)) {
    return { success: false as const, error: "Credenciais do WhatsApp (Meta) não configuradas." };
  }

  const { error: requeueError } = await supabaseAdmin.rpc("requeue_stale_wa_jobs", { p_stale_minutes: 15 });
  if (requeueError) console.error("Falha ao recolocar jobs travados na fila:", requeueError.message);

  const { data: claimed, error: claimError } = await supabaseAdmin.rpc(JOBS_CLAIM_RPC, { p_limit: limit, p_worker: workerId });
  if (claimError) return { success: false as const, error: claimError.message };
  const batch = (claimed ?? []) as JobRow[];
  if (batch.length === 0) return { success: true as const, claimed: 0, sent: 0, failed: 0, retry: 0, dryRun, workerId };

  if (dryRun) {
    const preview: { id: string; recipientId: string; attemptsAfterClaim: number }[] = [];
    for (const job of batch) {
      preview.push({ id: job.id, recipientId: job.recipient_id, attemptsAfterClaim: job.attempts });
      await supabaseAdmin
        .from(JOBS_TABLE)
        .update({ status: "queued", attempts: Math.max(job.attempts - 1, 0), locked_by: null, locked_at: null })
        .eq("id", job.id);
    }
    return { success: true as const, dryRun: true, claimed: batch.length, sent: 0, failed: 0, retry: 0, workerId, preview };
  }

  // Contexto do lote: destinatários e campanhas, buscados de uma vez só.
  const recipientIds = batch.map((j) => j.recipient_id);
  const campaignIds = [...new Set(batch.map((j) => j.campaign_id))];
  const [{ data: recipientRows }, { data: campaignRows }] = await Promise.all([
    supabaseAdmin.from(RECIPIENTS_TABLE).select("*").in("id", recipientIds),
    supabaseAdmin.from(CAMPAIGNS_TABLE).select("*").in("id", campaignIds),
  ]);
  const recipientById = new Map<string, RecipientRow>();
  for (const row of (recipientRows ?? []) as RecipientRow[]) recipientById.set(row.id, row);
  const campaignById = new Map<string, CampaignRow>();
  for (const row of (campaignRows ?? []) as CampaignRow[]) campaignById.set(row.id, row);

  let sent = 0;
  let failed = 0;
  let retry = 0;
  const touchedCampaigns = new Set<string>();
  const { sendTemplateMessageMock } = useMock
    ? await import("./whatsapp-mock-provider.server")
    : ({} as typeof import("./whatsapp-mock-provider.server"));
  const automationQueueHandler = [...campaignById.values()].some((c) => c.origin === "automacao")
    ? (await import("./automations-engine.server")).handleAutomationQueueResult
    : null;

  // Corpo real dos templates deste lote (1 busca), pra espelhar o texto na caixa de entrada.
  let templateBodyByKey: Map<string, string> | null = null;
  if (!useMock) {
    try {
      const { listMetaTemplates } = await import("./whatsapp-meta.server");
      const templatesResult = await listMetaTemplates();
      if (templatesResult.success) {
        templateBodyByKey = new Map();
        for (const t of templatesResult.templates as { name: string; language: string; components: { type: string; text?: string }[] }[]) {
          const body = t.components.find((c) => c.type === "BODY")?.text;
          if (body) templateBodyByKey.set(`${t.name}:${t.language}`, body);
        }
      }
    } catch (error) {
      console.error("Falha ao buscar templates pra espelhar mensagem na caixa de entrada:", error);
    }
  }

  const processJob = async (job: JobRow) => {
    const recipient = recipientById.get(job.recipient_id);
    const campaign = campaignById.get(job.campaign_id);
    if (!recipient || !campaign) {
      await supabaseAdmin.from(JOBS_TABLE).update({ status: "failed", error: "destinatário ou campanha ausente", locked_by: null, locked_at: null }).eq("id", job.id);
      failed++;
      return;
    }
    touchedCampaigns.add(campaign.id);

    const bodyParams = Array.isArray(recipient.params) ? recipient.params : [];
    const templateLanguage = campaign.template_language || settings.templateLanguage;

    const result = useMock
      ? await sendTemplateMessageMock({
          jobId: job.id,
          to: recipient.phone,
          templateName: campaign.template_name,
          templateLanguage,
          bodyParams,
          dedupKey: `mock:${job.id}`,
        })
      : await sendTemplateMessage({
          accessToken: settings.accessToken ?? "",
          phoneNumberId: settings.phoneNumberId ?? "",
          to: recipient.phone,
          templateName: campaign.template_name,
          templateLanguage,
          bodyParams,
          ...(Array.isArray(campaign.body_param_tokens) ? { bodyParamTokens: campaign.body_param_tokens } : {}),
          ...(campaign.header_media_url ? { mediaUrl: campaign.header_media_url } : {}),
        });

    const now = new Date().toISOString();
    const canRetry = !result.ok && job.attempts < job.max_attempts;

    if (result.ok) {
      sent++;
      await Promise.all([
        supabaseAdmin
          .from(JOBS_TABLE)
          .update({ status: "done", error: null, next_attempt_at: null, locked_by: null, locked_at: null })
          .eq("id", job.id),
        supabaseAdmin
          .from(RECIPIENTS_TABLE)
          .update({ status: "sent", wa_message_id: result.waMessageId ?? null, sent_at: now, error_code: null, error_message: null })
          .eq("id", recipient.id),
      ]);
      if (!useMock) {
        const templateBody = templateBodyByKey?.get(`${campaign.template_name}:${templateLanguage}`);
        const renderedBody = templateBody
          ? renderTemplateBody(templateBody, bodyParams, campaign.body_param_tokens)
          : `Template: ${campaign.template_name}`;
        const { recordOutboundQueueMessage } = await import("./whatsapp-inbox.server");
        await recordOutboundQueueMessage({
          phone: recipient.phone,
          body: renderedBody,
          waMessageId: result.waMessageId ?? null,
        }).catch((error) => console.error("Falha ao espelhar envio na caixa de entrada:", error));
      }
    } else {
      if (canRetry) retry++;
      else failed++;
      await Promise.all([
        supabaseAdmin
          .from(JOBS_TABLE)
          .update({
            status: canRetry ? "retry_wait" : "failed",
            error: result.error,
            next_attempt_at: canRetry ? backoffFor(job.attempts) : null,
            locked_by: null,
            locked_at: null,
          })
          .eq("id", job.id),
        canRetry
          ? Promise.resolve()
          : supabaseAdmin
              .from(RECIPIENTS_TABLE)
              .update({ status: "failed", error_message: result.error, error_code: extractErrorCode(result.error) })
              .eq("id", recipient.id),
      ]);
    }

    if (automationQueueHandler && campaign.origin === "automacao" && recipient.customer_id) {
      await automationQueueHandler({
        campaignId: campaign.id,
        customerId: recipient.customer_id,
        outcome: result.ok ? "sent" : canRetry ? "retry" : "failed",
        error: result.ok ? null : result.error,
      });
    }
  };

  const CONCURRENCY = 10;
  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    await Promise.all(batch.slice(i, i + CONCURRENCY).map((job) => processJob(job)));
  }

  for (const campaignId of touchedCampaigns) await refreshCampaignStatus(campaignId);
  return { success: true as const, claimed: batch.length, sent, failed, retry, workerId, ...(useMock ? { provider: "mock" as const } : {}) };
}

function extractErrorCode(error: string | null | undefined): string | null {
  const match = String(error ?? "").match(/\b(\d{6})\b/);
  return match?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Webhook de status da Meta
// ---------------------------------------------------------------------------

const RANK: Record<string, number> = { sent: 0, delivered: 1, read: 2, failed: 3 };

export async function applyMetaStatusUpdate(status: {
  id: string;
  status: string;
  timestamp?: string;
  errors?: { code?: number; title?: string; message?: string }[];
}): Promise<void> {
  const supabaseAdmin = await admin();
  const { data: recipient } = await supabaseAdmin
    .from(RECIPIENTS_TABLE)
    .select("id, status, campaign_id")
    .eq("wa_message_id", status.id)
    .maybeSingle();
  if (!recipient) return;

  const row = recipient as { id: string; status: string; campaign_id: string };
  if (status.status !== "failed" && (RANK[status.status] ?? -1) <= (RANK[row.status] ?? -1)) return;

  const at = status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString();
  const patch: Record<string, unknown> = { status: status.status };
  if (status.status === "delivered") patch["delivered_at"] = at;
  if (status.status === "read") patch["read_at"] = at;
  if (status.status === "failed" && status.errors?.[0]) {
    const e = status.errors[0];
    patch["error_code"] = e.code ? String(e.code) : null;
    patch["error_message"] = [e.code, e.title ?? e.message].filter(Boolean).join(" — ");
  }

  await supabaseAdmin.from(RECIPIENTS_TABLE).update(patch as never).eq("id", row.id);
}
