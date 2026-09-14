import { loadSettings, toE164 } from "./whatsapp-meta.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type QueueJob = {
  id: string;
  campaign_id: string;
  customer_id: string;
  phone: string;
  template_name: string;
  template_language: string;
  body_params: unknown;
  media_url: string | null;
  attempts: number;
  max_attempts: number;
};

function backoffSeconds(attempt: number) {
  return Math.min(300, 5 * 2 ** Math.max(0, attempt - 1));
}

async function sendTemplate(job: QueueJob, settings: Awaited<ReturnType<typeof loadSettings>>, bodyParams: string[]) {
  if (!settings.accessToken || !settings.phoneNumberId) {
    return { ok: false as const, error: "Credenciais do WhatsApp (Meta) não configuradas." };
  }

  const components: any[] = [];
  if (bodyParams.length) {
    components.push({
      type: "body",
      parameters: bodyParams.map((text) => ({ type: "text", text })),
    });
  }

  const mediaUrl = job.media_url;
  if (mediaUrl && /^https?:\/\//i.test(mediaUrl) && !/placeholder|undefined|default/i.test(mediaUrl)) {
    const mediaType = /\.mp4(?:$|\?)/i.test(mediaUrl) || /video/i.test(mediaUrl) ? "video" : "image";
    components.push({
      type: "header",
      parameters: [{ type: mediaType, [mediaType]: { link: mediaUrl } }],
    });
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${settings.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toE164(job.phone),
        type: "template",
        template: {
          name: job.template_name,
          language: { code: job.template_language || settings.templateLanguage },
          ...(components.length ? { components } : {}),
        },
      }),
    });

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        ok: false as const,
        error: json?.error?.error_user_msg || json?.error?.message || `Meta respondeu ${res.status}`,
      };
    }

    return { ok: true as const, waMessageId: json?.messages?.[0]?.id as string | undefined };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
  }
}

async function resolveBodyParams(job: QueueJob, supabaseAdmin: any): Promise<string[]> {
  const params = Array.isArray(job.body_params) ? (job.body_params as string[]) : [];
  if (!params.some((p) => p.includes("{{"))) return params;

  const { data: lastOrder } = await supabaseAdmin
    .from("shopify_orders")
    .select("*")
    .eq("customer_id", job.customer_id)
    .order("processed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: customer } = await supabaseAdmin
    .from("shopify_customers")
    .select("first_name")
    .eq("id", job.customer_id)
    .maybeSingle();

  const order: any = lastOrder;
  const rawData = order?.raw_data as any;
  const replacements: Record<string, string> = {
    "{{NOME_CLIENTE}}": customer?.first_name || "Cliente",
    "{{NUMERO_PEDIDO}}": String(order?.order_number || order?.name || "—"),
    "{{VALOR_TOTAL}}": order?.total_price
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(order.total_price)
      : "—",
    "{{ITENS_COMPRADOS}}": order?.line_items_summary || "—",
    "{{CUPOM_DESCONTO}}": rawData?.discount_codes?.[0]?.code || "—",
    "{{FRETE_ESCOLHIDO}}": rawData?.shipping_lines?.[0]?.title || "—",
    "{{RASTREIO}}": order?.tracking_number || "—",
    "{{STATUS_PEDIDO}}": order?.fulfillment_status === "fulfilled" ? "Enviado" : "Processando",
  };

  return params.map((param) => {
    let text = param;
    for (const [key, value] of Object.entries(replacements)) {
      text = text.split(key).join(value);
    }
    return text;
  });
}

async function refreshCampaignStatus(campaignId: string, supabaseAdmin: any) {
  const { data: rows } = await supabaseAdmin
    .from("whatsapp_message_queue")
    .select("status")
    .eq("campaign_id", campaignId);

  const statuses = (rows ?? []) as { status: string }[];
  if (!statuses.length) return;
  const pending = statuses.some((r) => r.status === "queued" || r.status === "sending" || r.status === "retry_wait");
  if (pending) return;

  const sent = statuses.filter((r) => r.status === "sent").length;
  const failed = statuses.filter((r) => r.status === "failed").length;
  await supabaseAdmin
    .from("whatsapp_campaigns")
    .update({
      status: "finalizada",
      enviadas: sent,
      falhas: failed,
      total_destinatarios: statuses.length,
      sent_at: new Date().toISOString(),
    } as never)
    .eq("id", campaignId);
}

/** Processa um lote pequeno de mensagens. Seguro para execução concorrente graças ao claim SQL. */
export async function processWhatsAppMessageQueue(limit = 10) {
  const supabaseAdmin = await admin();
  const settings = await loadSettings();
  if (!settings.accessToken || !settings.phoneNumberId) {
    return { processed: 0, sent: 0, failed: 0, retried: 0, error: "WhatsApp Meta não configurado." };
  }

  const workerId = `app-${crypto.randomUUID()}`;
  const { data: jobs, error } = await supabaseAdmin.rpc("claim_whatsapp_message_queue", {
    p_limit: limit,
    p_worker: workerId,
  });
  if (error) throw new Error(`Falha ao reivindicar fila WhatsApp: ${error.message}`);

  let sent = 0;
  let failed = 0;
  let retried = 0;
  const campaignIds = new Set<string>();

  for (const raw of (jobs ?? []) as QueueJob[]) {
    campaignIds.add(raw.campaign_id);
    const to = toE164(raw.phone);

    if (!to) {
      failed++;
      await supabaseAdmin
        .from("whatsapp_message_queue")
        .update({ status: "failed", error: "Telefone inválido", failed_at: new Date().toISOString(), updated_at: new Date().toISOString() } as never)
        .eq("id", raw.id);
      await supabaseAdmin
        .from("whatsapp_campaign_recipients")
        .upsert({ campaign_id: raw.campaign_id, customer_id: raw.customer_id, phone: raw.phone, status: "failed", error: "Telefone inválido" } as never, { onConflict: "campaign_id,customer_id" });
      continue;
    }

    try {
      const bodyParams = await resolveBodyParams(raw, supabaseAdmin);
      const result = await sendTemplate({ ...raw, phone: to }, settings, bodyParams);

      if (result.ok) {
        sent++;
        await supabaseAdmin
          .from("whatsapp_message_queue")
          .update({ status: "sent", wa_message_id: result.waMessageId ?? null, sent_at: new Date().toISOString(), error: null, locked_at: null, locked_by: null, updated_at: new Date().toISOString() } as never)
          .eq("id", raw.id);
        await supabaseAdmin
          .from("whatsapp_campaign_recipients")
          .upsert({ campaign_id: raw.campaign_id, customer_id: raw.customer_id, phone: to, wa_message_id: result.waMessageId ?? null, status: "sent", error: null } as never, { onConflict: "campaign_id,customer_id" });
      } else {
        const retryable = raw.attempts < raw.max_attempts;
        if (retryable) {
          retried++;
          const nextAttemptAt = new Date(Date.now() + backoffSeconds(raw.attempts) * 1000).toISOString();
          await supabaseAdmin
            .from("whatsapp_message_queue")
            .update({ status: "retry_wait", next_attempt_at: nextAttemptAt, error: result.error, locked_at: null, locked_by: null, updated_at: new Date().toISOString() } as never)
            .eq("id", raw.id);
        } else {
          failed++;
          await supabaseAdmin
            .from("whatsapp_message_queue")
            .update({ status: "failed", error: result.error, failed_at: new Date().toISOString(), locked_at: null, locked_by: null, updated_at: new Date().toISOString() } as never)
            .eq("id", raw.id);
          await supabaseAdmin
            .from("whatsapp_campaign_recipients")
            .upsert({ campaign_id: raw.campaign_id, customer_id: raw.customer_id, phone: to, status: "failed", error: result.error } as never, { onConflict: "campaign_id,customer_id" });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (raw.attempts < raw.max_attempts) {
        retried++;
        const nextAttemptAt = new Date(Date.now() + backoffSeconds(raw.attempts) * 1000).toISOString();
        await supabaseAdmin.from("whatsapp_message_queue").update({ status: "retry_wait", next_attempt_at: nextAttemptAt, error: message, locked_at: null, locked_by: null, updated_at: new Date().toISOString() } as never).eq("id", raw.id);
      } else {
        failed++;
        await supabaseAdmin.from("whatsapp_message_queue").update({ status: "failed", error: message, failed_at: new Date().toISOString(), locked_at: null, locked_by: null, updated_at: new Date().toISOString() } as never).eq("id", raw.id);
      }
    }
  }

  for (const campaignId of campaignIds) await refreshCampaignStatus(campaignId, supabaseAdmin);
  return { processed: (jobs ?? []).length, sent, failed, retried };
}

export async function enqueueWhatsAppCampaign(params: {
  campaignId: string;
  segmentType: string;
  segmentId?: string;
  templateName: string;
  templateLanguage: string;
  bodyParams: string[];
  restrictToCustomerIds?: string[];
}) {
  const supabaseAdmin = await admin();
  const { getSegmentCustomerIds, resolveSegmentRecipients } = await import("./whatsapp-meta.server");

  let ids = await getSegmentCustomerIds(params.segmentType, params.segmentId);
  if (params.restrictToCustomerIds) {
    const allowed = new Set(params.restrictToCustomerIds);
    ids = ids.filter((id) => allowed.has(id));
  }

  const recipients = await resolveSegmentRecipients(params.segmentType, ids);
  const rows = recipients
    .map((recipient: any) => {
      const phone = toE164(recipient.phone);
      if (!phone) return null;
      return {
        campaign_id: params.campaignId,
        customer_id: recipient.id,
        phone,
        template_name: params.templateName,
        template_language: params.templateLanguage,
        body_params: params.bodyParams,
        media_url: /^https?:\/\//i.test(recipient.video_url ?? "") ? recipient.video_url : null,
        status: "queued",
      };
    })
    .filter(Boolean);

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await supabaseAdmin
      .from("whatsapp_message_queue")
      .upsert(chunk as never, { onConflict: "campaign_id,customer_id", ignoreDuplicates: true });
    if (error) throw new Error(`Falha ao enfileirar mensagens WhatsApp: ${error.message}`);
  }

  await supabaseAdmin.from("whatsapp_campaigns").update({ status: "enviando", total_destinatarios: rows.length } as never).eq("id", params.campaignId);
  return { total: rows.length };
}
