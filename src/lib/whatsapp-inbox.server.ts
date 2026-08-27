/** Caixa de entrada do WhatsApp: registra tudo que o cliente manda pro número conectado
 *  e permite responder em texto livre dentro da janela de 24h da Meta. */

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type IncomingMessage = {
  id?: string;
  from: string;
  type?: string;
  timestamp?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  image?: { id?: string; caption?: string };
  audio?: { id?: string };
  video?: { id?: string; caption?: string };
  document?: { id?: string; filename?: string };
};

export function describeIncoming(message: IncomingMessage): { body: string; type: string } {
  const type = String(message.type ?? "text");
  if (message.text?.body) return { body: message.text.body, type: "text" };
  if (message.button?.text) return { body: message.button.text, type: "button" };
  const inter = message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title;
  if (inter) return { body: inter, type: "button" };
  if (message.image) return { body: message.image.caption ?? "[imagem]", type: "image" };
  if (message.video) return { body: message.video.caption ?? "[vídeo]", type: "video" };
  if (message.audio) return { body: "[áudio]", type: "audio" };
  if (message.document) return { body: `[documento] ${message.document.filename ?? ""}`.trim(), type: "document" };
  return { body: `[${type}]`, type };
}

/** Garante a conversa (thread) do telefone, vinculando ao cliente da Shopify quando existir. */
async function ensureThread(phone: string, contactName?: string | null) {
  const supabaseAdmin = await admin();
  const { data: existing } = await supabaseAdmin
    .from("whatsapp_inbox_threads")
    .select("id, customer_id, contact_name")
    .eq("phone", phone)
    .maybeSingle();

  if (existing) return existing as { id: string; customer_id: string | null; contact_name: string | null };

  const { data: customer } = await supabaseAdmin
    .from("shopify_customers")
    .select("id, first_name, last_name")
    .eq("phone", phone)
    .maybeSingle();
  const c = customer as { id: string; first_name: string | null; last_name: string | null } | null;
  const customerName = c ? [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || null : null;

  const { data: created } = await supabaseAdmin
    .from("whatsapp_inbox_threads")
    .insert({
      phone,
      contact_name: contactName ?? customerName,
      customer_id: c?.id ?? null,
    } as never)
    .select("id, customer_id, contact_name")
    .single();

  return created as { id: string; customer_id: string | null; contact_name: string | null };
}

/** Grava uma mensagem recebida do cliente na caixa de entrada (idempotente pelo id da Meta). */
export async function recordInboundMessage(message: IncomingMessage, contactName?: string | null): Promise<void> {
  const { toE164 } = await import("./whatsapp-meta.server");
  const phone = toE164(message.from);
  if (!phone) return;

  const supabaseAdmin = await admin();
  const thread = await ensureThread(phone, contactName);
  if (!thread) return;

  const { body, type } = describeIncoming(message);
  const sentAt = message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString();

  const { error } = await supabaseAdmin.from("whatsapp_inbox_messages").insert({
    thread_id: thread.id,
    direction: "inbound",
    body,
    message_type: type,
    wa_message_id: message.id ?? null,
    sent_at: sentAt,
  } as never);
  // Reentrega do webhook cai no unique de wa_message_id — ignora sem duplicar nem atualizar contadores.
  if (error) return;

  const { data: current } = await supabaseAdmin
    .from("whatsapp_inbox_threads")
    .select("unread_count")
    .eq("id", thread.id)
    .maybeSingle();

  await supabaseAdmin
    .from("whatsapp_inbox_threads")
    .update({
      last_message_at: sentAt,
      last_inbound_at: sentAt,
      last_message_preview: body.slice(0, 160),
      unread_count: ((current as { unread_count: number } | null)?.unread_count ?? 0) + 1,
      ...(thread.contact_name ? {} : contactName ? { contact_name: contactName } : {}),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", thread.id);
}

function buildOutboundPreview(templateName: string, bodyParams: string[], bodyParamTokens: string[] | null | undefined): string {
  if (bodyParams.length === 0) return `Template: ${templateName}`;
  const parts = bodyParams.map((value, i) => {
    const token = bodyParamTokens?.[i];
    return token ? `${token}=${value}` : value;
  });
  return `Template: ${templateName} (${parts.join(", ")})`;
}

/** Espelha um envio de campanha/automação (fila de WhatsApp) na caixa de entrada, na mesma
 *  thread do cliente — sem isso, mensagens de template ficavam invisíveis em "Conversas",
 *  só apareciam na lista de Campanhas. Chamado pelo worker da fila após um envio confirmado. */
export async function recordOutboundQueueMessage(params: {
  phone: string;
  templateName: string;
  bodyParams: string[];
  bodyParamTokens?: string[] | null;
  waMessageId: string | null;
}): Promise<void> {
  const { toE164 } = await import("./whatsapp-meta.server");
  const phone = toE164(params.phone);
  if (!phone) return;

  const supabaseAdmin = await admin();
  const thread = await ensureThread(phone);
  if (!thread) return;

  const body = buildOutboundPreview(params.templateName, params.bodyParams, params.bodyParamTokens);
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin.from("whatsapp_inbox_messages").insert({
    thread_id: thread.id,
    direction: "outbound",
    body,
    message_type: "template",
    status: "sent",
    wa_message_id: params.waMessageId,
    sent_at: now,
  } as never);
  if (error) return;

  await supabaseAdmin
    .from("whatsapp_inbox_threads")
    .update({ last_message_at: now, last_message_preview: body.slice(0, 160), updated_at: now } as never)
    .eq("id", thread.id);
}

/** Envia resposta em texto livre pela Graph API. Só funciona dentro da janela de 24h
 *  (última mensagem recebida do cliente) — regra da Meta para mensagens fora de template. */
export async function sendInboxReply(threadId: string, text: string): Promise<{ success: boolean; error?: string }> {
  const supabaseAdmin = await admin();
  const { data: threadRow } = await supabaseAdmin
    .from("whatsapp_inbox_threads")
    .select("id, phone, last_inbound_at")
    .eq("id", threadId)
    .maybeSingle();
  const thread = threadRow as { id: string; phone: string; last_inbound_at: string | null } | null;
  if (!thread) return { success: false, error: "Conversa não encontrada." };

  const lastInbound = thread.last_inbound_at ? new Date(thread.last_inbound_at).getTime() : 0;
  if (Date.now() - lastInbound > 24 * 60 * 60 * 1000) {
    return {
      success: false,
      error: "Janela de 24h encerrada. Só é possível reabrir a conversa enviando um template aprovado (aba Campanhas).",
    };
  }

  const { loadSettings } = await import("./whatsapp-meta.server");
  const settings = await loadSettings();
  if (!settings.accessToken || !settings.phoneNumberId) {
    return { success: false, error: "Configure o token de acesso e o Phone Number ID em Configurações." };
  }

  const res = await fetch(`https://graph.facebook.com/v20.0/${settings.phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.accessToken}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: thread.phone,
      type: "text",
      text: { body: text, preview_url: true },
    }),
  });
  const json: any = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = json?.error?.message ?? `Meta respondeu ${res.status}`;
    await supabaseAdmin.from("whatsapp_inbox_messages").insert({
      thread_id: thread.id,
      direction: "outbound",
      body: text,
      status: "failed",
      error,
    } as never);
    return { success: false, error };
  }

  const now = new Date().toISOString();
  await supabaseAdmin.from("whatsapp_inbox_messages").insert({
    thread_id: thread.id,
    direction: "outbound",
    body: text,
    status: "sent",
    wa_message_id: json?.messages?.[0]?.id ?? null,
    sent_at: now,
  } as never);

  await supabaseAdmin
    .from("whatsapp_inbox_threads")
    .update({ last_message_at: now, last_message_preview: text.slice(0, 160), unread_count: 0, updated_at: now } as never)
    .eq("id", thread.id);

  return { success: true };
}
