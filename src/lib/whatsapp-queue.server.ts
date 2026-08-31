/**
 * Fila única de envio do WhatsApp (Meta Cloud API).
 * Nenhum ponto do sistema deve chamar a Meta diretamente para campanhas.
 */

import type { SegmentType } from "./crm-mock";
import { resolveAutomationBodyParams, type AutomationEventContext } from "./whatsapp-automation-context";

/** Substitui os tokens do corpo do template pelos valores reais enviados — pra registrar
 *  na caixa de entrada o texto de verdade que o cliente recebeu, não um resumo técnico. */
function renderTemplateBody(bodyText: string, bodyParams: string[], bodyParamTokens: string[] | null | undefined): string {
  return bodyText.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, token: string) => {
    if (bodyParamTokens && bodyParamTokens.length > 0) {
      const idx = bodyParamTokens.indexOf(token);
      return idx >= 0 && bodyParams[idx] !== undefined ? bodyParams[idx] : match;
    }
    const idx = Number(token) - 1;
    return Number.isInteger(idx) && bodyParams[idx] !== undefined ? bodyParams[idx] : match;
  });
}

export const QUEUE_STATUSES = ["queued", "sending", "retry_wait", "sent", "failed", "cancelled", "skipped"] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export const QUEUE_TABLE = "whatsapp_message_queue";
export const QUEUE_CLAIM_RPC = "claim_whatsapp_message_queue";
const RETRY_BACKOFF_MINUTES = [5, 30, 120];
const DEFAULT_MAX_ATTEMPTS = 3;

export type QueueRow = {
  id: string;
  campaign_id: string | null;
  customer_id: string | null;
  phone: string;
  origem: string;
  template_name: string;
  template_language: string;
  body_params: string[] | null;
  body_param_tokens: string[] | null;
  header_media_url: string | null;
  status: QueueStatus;
  priority: number;
  scheduled_at: string;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string | null;
  error: string | null;
  wa_message_id: string | null;
  sent_at: string | null;
  dedup_key: string | null;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as {
    from: (t: string) => any;
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
}

function backoffFor(attempts: number): string {
  const idx = Math.min(Math.max(attempts - 1, 0), RETRY_BACKOFF_MINUTES.length - 1);
  const minutes = RETRY_BACKOFF_MINUTES[idx] ?? 120;
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function isValidMediaUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value) && !value.includes("placeholder") && !value.includes("undefined");
}

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
  cashback: Awaited<ReturnType<typeof import("./cashback.server")["loadCashbackForOrder"]>>;
};

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Carrega em LOTE (poucas queries) o último pedido + itens + rastreio + cashback de todos os
 *  destinatários. Sem isso, resolver tokens por destinatário faria 3–4 queries por pessoa e o
 *  enfileiramento de campanhas grandes estourava o tempo da requisição — deixando a fila vazia. */
async function preloadOrderBundles(customerIds: string[]): Promise<Map<string, OrderBundle>> {
  const result = new Map<string, OrderBundle>();
  const ids = [...new Set(customerIds.filter(Boolean))];
  if (ids.length === 0) return result;
  const supabaseAdmin = await admin();

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
      supabaseAdmin.from("shopify_order_items").select("order_id, title, variant_title, quantity").in("order_id", part),
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
      cashback: cashbackByOrder.get(key) ?? null,
    });
  }
  return result;
}

/** Resolve os tokens dinâmicos no momento do enfileiramento. Em automações, o snapshot congelado
 * tem prioridade absoluta; campanhas avulsas continuam usando o estado mais recente do cliente. */
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

  const brl = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));

  const trackingNumber = fulfillment?.tracking_number || "—";
  const trackingUrl = fulfillment?.tracking_url || "—";
  const fulfillmentStatus = String(fulfillment?.status ?? order?.fulfillment_status ?? "").toLowerCase();
  const isSent = Boolean(fulfillment?.tracking_number) || ["success", "fulfilled", "in_transit"].includes(fulfillmentStatus);
  const replacements: Record<string, string> = {
    "{{NOME_CLIENTE}}": recipient.first_name || "Cliente",
    "{{NUMERO_PEDIDO}}": order?.order_number || order?.name || "—",
    "{{VALOR_TOTAL}}": order?.total_price
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(order.total_price)
      : "—",
    "{{ITENS_COMPRADOS}}": formatPurchasedItems(purchasedItems),
    "{{CUPOM_DESCONTO}}": firstDiscountCode(rawData),
    "{{FRETE_ESCOLHIDO}}": shippingTitle(rawData),
    "{{RASTREIO}}": trackingNumber,
    "{{LINK_RASTREIO}}": trackingUrl,
    "{{STATUS_PEDIDO}}": isSent ? "Enviado" : "Processando",
    "{{LINK_CHECKOUT}}": recipient.checkout_url || "—",
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

export async function enqueueCampaign(
  campaignId: string,
  restrictToCustomerIds?: string[],
  options?: { scheduledAt?: string; priority?: number },
) {
  const supabaseAdmin = await admin();
  const { loadSettings, getSegmentCustomerIds, resolveSegmentRecipients, toE164 } = await import("./whatsapp-meta.server");

  const { data: campaignRow } = await supabaseAdmin
    .from("whatsapp_campaigns")
    .select("id, segment_type, segment_id, template_name, template_language, body_params, body_param_tokens, origem")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaignRow) return { success: false as const, error: "Campanha não encontrada." };

  const settings = await loadSettings();
  if (!settings.accessToken || !settings.phoneNumberId) {
    return { success: false as const, error: "Credenciais do WhatsApp (Meta) não configuradas." };
  }

  const schedule = normalizeScheduledAt(options?.scheduledAt);
  if (!schedule.success) return { success: false as const, error: schedule.error };

  const campaign = campaignRow as any;
  const bodyParams: string[] = Array.isArray(campaign.body_params) ? campaign.body_params : [];
  const bodyParamTokens: string[] | null = Array.isArray(campaign.body_param_tokens) ? campaign.body_param_tokens : null;
  const ids = restrictToCustomerIds
    ? [...new Set(restrictToCustomerIds)]
    : await getSegmentCustomerIds(campaign.segment_type as SegmentType, campaign.segment_id || undefined);
  const recipients = (await resolveSegmentRecipients(campaign.segment_type, ids)) as Array<{
    id: string;
    phone: string;
    first_name?: string | null;
    checkout_url?: string | null;
    video_url?: string | null;
  }>;

  let frozenContexts = new Map<string, AutomationEventContext>();
  if (campaign.origem === "automacao") {
    const { loadAutomationContextsForCampaign } = await import("./whatsapp-automation-context.server");
    frozenContexts = await loadAutomationContextsForCampaign(campaignId);
  }

  const needsOrderTokens = bodyParams.some((p) => p.includes("{{"));
  const bundles = needsOrderTokens
    ? await preloadOrderBundles(recipients.filter((r) => !frozenContexts.has(r.id)).map((r) => r.id))
    : new Map<string, OrderBundle>();

  const scheduledAt = schedule.iso;
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const recipient of recipients) {
    const to = toE164(recipient.phone);
    if (!to) {
      skipped++;
      continue;
    }
    // Campanhas de automação reaproveitam a mesma campaignId pra sempre (histórico unificado),
    // então dedup só por campanha+telefone faria um pedido novo ser silenciosamente descartado
    // (onConflict ignoreDuplicates) por já existir uma linha antiga do MESMO telefone nessa
    // campanha, de um pedido anterior. Incluindo o pedido/checkout no dedup, cada evento novo
    // ganha sua própria linha — a proteção contra duplicidade continua valendo por evento.
    const context = frozenContexts.get(recipient.id);
    const eventId = context?.order?.id ?? context?.checkout?.id ?? null;
    const dedupKey = eventId ? `campaign:${campaignId}:${to}:${eventId}` : `campaign:${campaignId}:${to}`;
    rows.push({
      campaign_id: campaignId,
      customer_id: recipient.id ?? null,
      phone: to,
      origem: campaign.origem ?? "crm",
      template_name: campaign.template_name,
      template_language: campaign.template_language ?? settings.templateLanguage,
      body_params: await resolveBodyParams(bodyParams, recipient, context, bundles.get(recipient.id)),
      body_param_tokens: bodyParamTokens,
      header_media_url: isValidMediaUrl(recipient.video_url) ? recipient.video_url : null,
      status: "queued" satisfies QueueStatus,
      priority: options?.priority ?? 5,
      scheduled_at: scheduledAt,
      attempts: 0,
      max_attempts: DEFAULT_MAX_ATTEMPTS,
      next_attempt_at: scheduledAt,
      error: null,
      dedup_key: dedupKey,
    });
  }

  let queued = 0;
  for (const part of chunk(rows, 200)) {
    const { error } = await supabaseAdmin.from(QUEUE_TABLE).upsert(part, { onConflict: "dedup_key", ignoreDuplicates: true });
    if (error) {
      console.error("[enqueueCampaign] falha ao inserir lote na fila", { campaignId, queued, batch: part.length, error: error.message });
      return { success: false as const, error: error.message };
    }
    queued += part.length;
  }

  if (queued === 0) {
    console.error("[enqueueCampaign] nenhuma mensagem enfileirada", {
      campaignId,
      recipients: recipients.length,
      skipped,
    });
    await supabaseAdmin
      .from("whatsapp_campaigns")
      .update({ status: "cancelada", total_destinatarios: 0 })
      .eq("id", campaignId);
    return {
      success: false as const,
      error:
        recipients.length === 0
          ? "Nenhum destinatário válido foi encontrado para esse público."
          : `Nenhum telefone válido entre os ${recipients.length} destinatários (${skipped} descartados).`,
    };
  }

  await supabaseAdmin
    .from("whatsapp_campaigns")
    .update({ status: schedule.future ? "agendada" : "enviando", total_destinatarios: queued })
    .eq("id", campaignId);
  return { success: true as const, campaignId, queued, skipped, total: recipients.length, scheduledAt };

}

export async function cancelCampaignQueue(campaignId: string) {
  const supabaseAdmin = await admin();
  const { error } = await supabaseAdmin
    .from(QUEUE_TABLE)
    .update({ status: "cancelled" satisfies QueueStatus, error: "cancelado pelo painel" })
    .eq("campaign_id", campaignId)
    .in("status", ["queued", "retry_wait"] satisfies QueueStatus[]);
  if (error) return { success: false as const, error: error.message };
  await refreshCampaignStatus(campaignId);
  return { success: true as const };
}

export async function refreshCampaignStatus(campaignId: string) {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin.from(QUEUE_TABLE).select("status, sent_at, scheduled_at").eq("campaign_id", campaignId);
  const rows = (data ?? []) as { status: QueueStatus; sent_at: string | null; scheduled_at: string }[];
  if (rows.length === 0) return null;

  const count = (status: QueueStatus) => rows.filter((row) => row.status === status).length;
  const sent = count("sent");
  const failed = count("failed");
  const cancelled = count("cancelled");
  const skipped = count("skipped");
  const pending = count("queued") + count("sending") + count("retry_wait");
  const lastSentAt = rows.map((r) => r.sent_at).filter((v): v is string => Boolean(v)).sort().pop();
  const pendingRows = rows.filter((row) => ["queued", "retry_wait"].includes(row.status));
  const stillScheduled = sent === 0 && pending > 0 && pendingRows.length === pending && pendingRows.every((r) => new Date(r.scheduled_at).getTime() > Date.now());
  const status = stillScheduled ? "agendada" : pending > 0 ? "enviando" : cancelled > 0 && sent === 0 ? "cancelada" : "finalizada";

  await supabaseAdmin
    .from("whatsapp_campaigns")
    .update({
      status,
      enviadas: sent,
      falhas: failed,
      total_destinatarios: rows.length,
      ...(pending === 0 && lastSentAt ? { sent_at: lastSentAt } : {}),
    })
    .eq("id", campaignId);
  return { status, sent, failed, cancelled, skipped, pending, total: rows.length };
}

export async function processWhatsappQueueBatch(options?: {
  limit?: number;
  workerId?: string;
  dryRun?: boolean;
  provider?: "meta" | "mock";
}) {
  const supabaseAdmin = await admin();
  const { loadSettings, sendTemplateMessage } = await import("./whatsapp-meta.server");
  const limit = options?.limit ?? 20;
  const dryRun = options?.dryRun === true;
  const useMock = options?.provider === "mock";
  const workerId = options?.workerId ?? `${useMock ? "mock" : dryRun ? "dryrun" : "worker"}-${Math.random().toString(36).slice(2, 10)}`;

  const settings = await loadSettings();
  if (!useMock && (!settings.accessToken || !settings.phoneNumberId)) {
    return { success: false as const, error: "Credenciais do WhatsApp (Meta) não configuradas." };
  }

  // Jobs que ficaram presos em "sending" (worker morreu no meio) mantêm a campanha eternamente
  // em "enviando". Antes de cada lote, devolvemos os travados pra fila.
  const { error: requeueError } = await supabaseAdmin.rpc("requeue_stale_whatsapp_queue", { p_stale_minutes: 15 });
  if (requeueError) console.error("Falha ao recolocar jobs travados na fila:", requeueError.message);

  const { data: claimed, error: claimError } = await supabaseAdmin.rpc(QUEUE_CLAIM_RPC, { p_limit: limit, p_worker: workerId });
  if (claimError) return { success: false as const, error: claimError.message };
  const batch = (claimed ?? []) as QueueRow[];
  if (batch.length === 0) return { success: true as const, claimed: 0, sent: 0, failed: 0, retry: 0, dryRun, workerId };

  if (dryRun) {
    const preview: { id: string; phone: string; template: string; attemptsAfterClaim: number }[] = [];
    for (const item of batch) {
      preview.push({ id: item.id, phone: item.phone, template: item.template_name, attemptsAfterClaim: item.attempts });
      await supabaseAdmin
        .from(QUEUE_TABLE)
        .update({ status: "queued" satisfies QueueStatus, attempts: Math.max(item.attempts - 1, 0), locked_by: null, locked_at: null })
        .eq("id", item.id);
    }
    return { success: true as const, dryRun: true, claimed: batch.length, sent: 0, failed: 0, retry: 0, workerId, preview };
  }

  let sent = 0;
  let failed = 0;
  let retry = 0;
  let skippedNonMock = 0;
  const mockLog: { jobId: string; ok: boolean; to: string; template: string; language: string; params: number }[] = [];
  const touchedCampaigns = new Set<string>();
  const { isMockJob, sendTemplateMessageMock } = useMock
    ? await import("./whatsapp-mock-provider.server")
    : ({} as typeof import("./whatsapp-mock-provider.server"));
  const automationQueueHandler = batch.some((item) => item.origem === "automacao")
    ? (await import("./automations-engine.server")).handleAutomationQueueResult
    : null;

  // Corpo real dos templates usados neste lote, buscado 1x (não por mensagem), só pra poder
  // espelhar o texto de verdade na caixa de entrada em vez de um resumo técnico.
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

  for (const item of batch) {
    if (useMock && !isMockJob(item.dedup_key)) {
      skippedNonMock++;
      await supabaseAdmin
        .from(QUEUE_TABLE)
        .update({ status: "queued" satisfies QueueStatus, attempts: Math.max(item.attempts - 1, 0), locked_by: null, locked_at: null })
        .eq("id", item.id);
      continue;
    }
    if (item.campaign_id) touchedCampaigns.add(item.campaign_id);

    const result = useMock
      ? await sendTemplateMessageMock({
          jobId: item.id,
          to: item.phone,
          templateName: item.template_name,
          templateLanguage: item.template_language,
          bodyParams: Array.isArray(item.body_params) ? item.body_params : [],
          dedupKey: item.dedup_key,
        })
      : await sendTemplateMessage({
          accessToken: settings.accessToken ?? "",
          phoneNumberId: settings.phoneNumberId ?? "",
          to: item.phone,
          templateName: item.template_name,
          templateLanguage: item.template_language || settings.templateLanguage,
          bodyParams: Array.isArray(item.body_params) ? item.body_params : [],
          ...(Array.isArray(item.body_param_tokens) ? { bodyParamTokens: item.body_param_tokens } : {}),
          ...(item.header_media_url ? { mediaUrl: item.header_media_url } : {}),
        });

    if (useMock) mockLog.push({ jobId: item.id, ok: result.ok, to: item.phone, template: item.template_name, language: item.template_language, params: Array.isArray(item.body_params) ? item.body_params.length : 0 });
    const now = new Date().toISOString();
    const canRetry = !result.ok && item.attempts < item.max_attempts;

    if (result.ok) {
      sent++;
      await supabaseAdmin
        .from(QUEUE_TABLE)
        .update({ status: "sent" satisfies QueueStatus, wa_message_id: result.waMessageId ?? null, sent_at: now, error: null, next_attempt_at: null, locked_by: null, locked_at: null })
        .eq("id", item.id);
      if (!useMock) {
        const bodyParams = Array.isArray(item.body_params) ? item.body_params : [];
        const templateBody = templateBodyByKey?.get(`${item.template_name}:${item.template_language}`);
        const renderedBody = templateBody
          ? renderTemplateBody(templateBody, bodyParams, item.body_param_tokens)
          : `Template: ${item.template_name}`;
        const { recordOutboundQueueMessage } = await import("./whatsapp-inbox.server");
        await recordOutboundQueueMessage({
          phone: item.phone,
          body: renderedBody,
          waMessageId: result.waMessageId ?? null,
        }).catch((error) => console.error("Falha ao espelhar envio na caixa de entrada:", error));
      }
    } else {
      if (canRetry) retry++;
      else failed++;
      await supabaseAdmin
        .from(QUEUE_TABLE)
        .update({ status: (canRetry ? "retry_wait" : "failed") satisfies QueueStatus, error: result.error, next_attempt_at: canRetry ? backoffFor(item.attempts) : null, locked_by: null, locked_at: null })
        .eq("id", item.id);
    }

    if (item.campaign_id) {
      const recipientPatch = {
        campaign_id: item.campaign_id,
        customer_id: item.customer_id,
        phone: item.phone,
        wa_message_id: result.ok ? (result.waMessageId ?? null) : null,
        status: result.ok ? "sent" : "failed",
        error: result.ok ? null : result.error,
        sent_at: result.ok ? now : null,
      };
      const { data: existing } = await supabaseAdmin
        .from("whatsapp_campaign_recipients")
        .select("id")
        .eq("campaign_id", item.campaign_id)
        .eq("phone", item.phone)
        .maybeSingle();
      if (existing) await supabaseAdmin.from("whatsapp_campaign_recipients").update(recipientPatch).eq("id", (existing as { id: string }).id);
      else await supabaseAdmin.from("whatsapp_campaign_recipients").insert(recipientPatch);
    }

    if (automationQueueHandler && item.origem === "automacao" && item.campaign_id && item.customer_id) {
      await automationQueueHandler({
        campaignId: item.campaign_id,
        customerId: item.customer_id,
        outcome: result.ok ? "sent" : canRetry ? "retry" : "failed",
        error: result.ok ? null : result.error,
      });
    }
  }

  for (const campaignId of touchedCampaigns) await refreshCampaignStatus(campaignId);
  return {
    success: true as const,
    claimed: batch.length,
    sent,
    failed,
    retry,
    workerId,
    ...(useMock ? { provider: "mock" as const, skippedNonMock, mockLog } : {}),
  };
}
