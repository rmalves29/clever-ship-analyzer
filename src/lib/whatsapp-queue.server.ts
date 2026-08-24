/**
 * Fila única de envio do WhatsApp (Meta Cloud API).
 *
 * Contrato de schema (tabela `public.whatsapp_message_queue`, migration AINDA NÃO aplicada):
 *   status         : queued | sending | retry_wait | sent | failed | cancelled | skipped
 *   retry/erro     : attempts, max_attempts, next_attempt_at, error
 *   claim atômico  : rpc claim_whatsapp_message_queue(p_limit INTEGER, p_worker TEXT)
 *
 * Nenhum ponto do sistema deve chamar a Meta diretamente para campanhas: o enfileiramento
 * (`enqueueCampaign`) e o worker (`processWhatsappQueueBatch`) são o único caminho de envio.
 */

import type { SegmentType } from "./crm-mock";

export const QUEUE_STATUSES = [
  "queued",
  "sending",
  "retry_wait",
  "sent",
  "failed",
  "cancelled",
  "skipped",
] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export const QUEUE_TABLE = "whatsapp_message_queue";
export const QUEUE_CLAIM_RPC = "claim_whatsapp_message_queue";

/** Backoff entre tentativas, em minutos, indexado por número de tentativas já feitas. */
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
  // A tabela da fila ainda não existe nos tipos gerados (migration pendente).
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
  return (
    typeof value === "string" &&
    /^https?:\/\//i.test(value) &&
    !value.includes("placeholder") &&
    !value.includes("undefined")
  );
}

/** Resolve os tokens dinâmicos ({{NOME_CLIENTE}}, {{RASTREIO}}, ...) no momento do enfileiramento,
 *  congelando o conteúdo enviado — o worker não recalcula nada. */
async function resolveBodyParams(
  bodyParams: string[],
  recipient: { id: string; first_name?: string | null; checkout_url?: string | null },
): Promise<string[]> {
  if (!bodyParams.some((p) => p.includes("{{"))) return [...bodyParams];

  const supabaseAdmin = await admin();
  const { data: lastOrder } = await supabaseAdmin
    .from("shopify_orders")
    .select("*")
    .eq("customer_id", recipient.id)
    .order("processed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const order = lastOrder as any;
  const rawData = order?.raw_data as any;

  const replacements: Record<string, string> = {
    "{{NOME_CLIENTE}}": recipient.first_name || "Cliente",
    "{{NUMERO_PEDIDO}}": order?.order_number || order?.name || "—",
    "{{VALOR_TOTAL}}": order?.total_price
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(order.total_price)
      : "—",
    "{{ITENS_COMPRADOS}}": order?.line_items_summary || "—",
    "{{CUPOM_DESCONTO}}": rawData?.discount_codes?.[0]?.code || "—",
    "{{FRETE_ESCOLHIDO}}": rawData?.shipping_lines?.[0]?.title || "—",
    "{{RASTREIO}}": order?.tracking_number || "—",
    "{{STATUS_PEDIDO}}": order?.fulfillment_status === "fulfilled" ? "Enviado" : "Processando",
    "{{LINK_CHECKOUT}}": recipient.checkout_url || "—",
  };

  return bodyParams.map((p) => {
    let text = p;
    for (const [key, val] of Object.entries(replacements)) {
      text = text.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), val);
    }
    return text;
  });
}

/**
 * Enfileira todos os destinatários de uma campanha. Não envia nada.
 * `restrictToCustomerIds` limita o lote (usado pelo motor de automação).
 */
export async function enqueueCampaign(
  campaignId: string,
  restrictToCustomerIds?: string[],
  options?: { scheduledAt?: string; priority?: number },
) {
  const supabaseAdmin = await admin();
  const { loadSettings, getSegmentCustomerIds, resolveSegmentRecipients, toE164 } = await import(
    "./whatsapp-meta.server"
  );

  const { data: campaignRow } = await supabaseAdmin
    .from("whatsapp_campaigns")
    .select("id, segment_type, segment_id, template_name, template_language, body_params, origem")
    .eq("id", campaignId)
    .maybeSingle();

  if (!campaignRow) return { success: false as const, error: "Campanha não encontrada." };

  const settings = await loadSettings();
  if (!settings.accessToken || !settings.phoneNumberId) {
    return { success: false as const, error: "Credenciais do WhatsApp (Meta) não configuradas." };
  }

  const campaign = campaignRow as any;
  const bodyParams: string[] = Array.isArray(campaign.body_params) ? campaign.body_params : [];

  let ids = await getSegmentCustomerIds(campaign.segment_type as SegmentType, campaign.segment_id || undefined);
  if (restrictToCustomerIds) {
    const restrict = new Set(restrictToCustomerIds);
    ids = ids.filter((id) => restrict.has(id));
  }

  const recipients = (await resolveSegmentRecipients(campaign.segment_type, ids)) as {
    id: string;
    phone: string;
    first_name?: string | null;
    checkout_url?: string | null;
    video_url?: string | null;
  }[];

  const scheduledAt = options?.scheduledAt ?? new Date().toISOString();
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const c of recipients) {
    const to = toE164(c.phone);
    if (!to) {
      skipped++;
      continue;
    }
    rows.push({
      campaign_id: campaignId,
      customer_id: c.id ?? null,
      phone: to,
      origem: campaign.origem ?? "crm",
      template_name: campaign.template_name,
      template_language: campaign.template_language ?? settings.templateLanguage,
      body_params: await resolveBodyParams(bodyParams, c),
      header_media_url: isValidMediaUrl(c.video_url) ? c.video_url : null,
      status: "queued" satisfies QueueStatus,
      priority: options?.priority ?? 5,
      scheduled_at: scheduledAt,
      attempts: 0,
      max_attempts: DEFAULT_MAX_ATTEMPTS,
      next_attempt_at: scheduledAt,
      error: null,
      dedup_key: `campaign:${campaignId}:${to}`,
    });
  }

  let queued = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabaseAdmin
      .from(QUEUE_TABLE)
      .upsert(chunk, { onConflict: "dedup_key", ignoreDuplicates: true });
    if (error) return { success: false as const, error: error.message };
    queued += chunk.length;
  }

  await supabaseAdmin
    .from("whatsapp_campaigns")
    .update({ status: "enviando", total_destinatarios: queued })
    .eq("id", campaignId);

  return { success: true as const, campaignId, queued, skipped, total: recipients.length };
}

/** Cancela tudo que ainda não saiu de uma campanha. */
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

/** Recalcula os contadores/estado da campanha a partir da fila. */
export async function refreshCampaignStatus(campaignId: string) {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin
    .from(QUEUE_TABLE)
    .select("status, sent_at")
    .eq("campaign_id", campaignId);

  const rows = (data ?? []) as { status: QueueStatus; sent_at: string | null }[];
  if (rows.length === 0) return null;

  const count = (s: QueueStatus) => rows.filter((r) => r.status === s).length;
  const sent = count("sent");
  const failed = count("failed");
  const cancelled = count("cancelled");
  const skipped = count("skipped");
  const pending = count("queued") + count("sending") + count("retry_wait");

  const lastSentAt = rows
    .map((r) => r.sent_at)
    .filter((v): v is string => Boolean(v))
    .sort()
    .pop();

  const status = pending > 0 ? "enviando" : cancelled > 0 && sent === 0 ? "cancelada" : "finalizada";

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

/**
 * Worker: reivindica um lote via RPC (`claim_whatsapp_message_queue`) e envia.
 * Único ponto do sistema autorizado a chamar a Meta para mensagens de campanha.
 */
export async function processWhatsappQueueBatch(options?: {
  limit?: number;
  workerId?: string;
  /** Modo teste: percorre claim → worker sem NENHUMA chamada ao provider.
   *  O job reclamado volta para `queued` com o contador de tentativas restaurado. */
  dryRun?: boolean;
  /** `mock` usa o provider simulado interno (sem rede) e só processa jobs com
   *  dedup_key iniciado por `mock-test:` — qualquer outro job é devolvido à fila. */
  provider?: "meta" | "mock";
}) {
  const supabaseAdmin = await admin();
  const { loadSettings, sendTemplateMessage } = await import("./whatsapp-meta.server");

  const limit = options?.limit ?? 20;
  const dryRun = options?.dryRun === true;
  const useMock = options?.provider === "mock";
  const workerId =
    options?.workerId ?? `${useMock ? "mock" : dryRun ? "dryrun" : "worker"}-${Math.random().toString(36).slice(2, 10)}`;

  const settings = await loadSettings();
  if (!useMock && (!settings.accessToken || !settings.phoneNumberId)) {
    return { success: false as const, error: "Credenciais do WhatsApp (Meta) não configuradas." };
  }

  const { data: claimed, error: claimError } = await supabaseAdmin.rpc(QUEUE_CLAIM_RPC, {
    p_limit: limit,
    p_worker: workerId,
  });
  if (claimError) return { success: false as const, error: claimError.message };


  const batch = (claimed ?? []) as QueueRow[];
  if (batch.length === 0)
    return { success: true as const, claimed: 0, sent: 0, failed: 0, retry: 0, dryRun, workerId };

  if (dryRun) {
    const preview: { id: string; phone: string; template: string; attemptsAfterClaim: number }[] = [];
    for (const item of batch) {
      preview.push({
        id: item.id,
        phone: item.phone,
        template: item.template_name,
        attemptsAfterClaim: item.attempts,
      });
      // devolve o job ao estado inerte, sem consumir tentativa e sem tocar em campanhas/destinatários
      await supabaseAdmin
        .from(QUEUE_TABLE)
        .update({
          status: "queued" satisfies QueueStatus,
          attempts: Math.max(item.attempts - 1, 0),
          locked_by: null,
          locked_at: null,
        })
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

  for (const item of batch) {
    if (useMock && !isMockJob(item.dedup_key)) {
      // trava de segurança: em modo mock nenhum job real é processado
      skippedNonMock++;
      await supabaseAdmin
        .from(QUEUE_TABLE)
        .update({
          status: "queued" satisfies QueueStatus,
          attempts: Math.max(item.attempts - 1, 0),
          locked_by: null,
          locked_at: null,
        })
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
          ...(item.header_media_url ? { mediaUrl: item.header_media_url } : {}),
        });

    if (useMock)
      mockLog.push({
        jobId: item.id,
        ok: result.ok,
        to: item.phone,
        template: item.template_name,
        language: item.template_language,
        params: Array.isArray(item.body_params) ? item.body_params.length : 0,
      });


    const now = new Date().toISOString();

    if (result.ok) {
      sent++;
      await supabaseAdmin
        .from(QUEUE_TABLE)
        .update({
          status: "sent" satisfies QueueStatus,
          wa_message_id: result.waMessageId ?? null,
          sent_at: now,
          error: null,
          next_attempt_at: null,
          locked_by: null,
          locked_at: null,
        })
        .eq("id", item.id);
    } else {
      const canRetry = item.attempts < item.max_attempts;
      if (canRetry) retry++;
      else failed++;
      await supabaseAdmin
        .from(QUEUE_TABLE)
        .update({
          status: (canRetry ? "retry_wait" : "failed") satisfies QueueStatus,
          error: result.error,
          next_attempt_at: canRetry ? backoffFor(item.attempts) : null,
          locked_by: null,
          locked_at: null,
        })
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
      if (existing) {
        await supabaseAdmin
          .from("whatsapp_campaign_recipients")
          .update(recipientPatch)
          .eq("id", (existing as { id: string }).id);
      } else {
        await supabaseAdmin.from("whatsapp_campaign_recipients").insert(recipientPatch);
      }
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
