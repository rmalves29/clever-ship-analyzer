import { loadUazapiCreds, sendText, sendMedia, toGroupJid, type MediaType } from "./envio-uazapi.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type EnvioContentType = "text" | "image" | "audio" | "video" | "video_note";

export type EnvioMessage = {
  id: string;
  campaign_id: string | null;
  group_id: string | null;
  content_type: EnvioContentType;
  content_text: string | null;
  media_url: string | null;
  status: "pending" | "sending" | "sent" | "failed";
  scheduled_at: string | null;
  sent_at: string | null;
  wa_message_id: string | null;
  created_at: string;
  updated_at: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const CONTENT_TO_MEDIA_TYPE: Record<Exclude<EnvioContentType, "text">, MediaType> = {
  image: "image",
  audio: "audio",
  video: "video",
  video_note: "ptv",
};

async function sendOneMessage(messageId: string): Promise<void> {
  const supabaseAdmin = await admin();
  // Tudo depois da leitura inicial fica num try/catch só — qualquer falha aqui (inclusive na busca
  // do grupo no live-launchpad-79) tem que marcar "failed", senão a mensagem trava em "sending"
  // pra sempre (já aconteceu: getLiveLaunchpadAdmin() lançando erro ficava sem cair em catch nenhum).
  try {
    const { data: msg } = await ((supabaseAdmin.from("envio_messages" as any) as any) as any).select("*").eq("id", messageId).maybeSingle();
    const m = msg as EnvioMessage | null;
    if (!m || !m.group_id) throw new Error("Mensagem sem grupo associado");

    const { getLiveLaunchpadAdmin } = await import("@/integrations/supabase/live-launchpad-client.server");
    const liveLaunchpadAdmin = await getLiveLaunchpadAdmin();
    const { data: group } = await (liveLaunchpadAdmin.from("fe_groups") as any).select("group_jid").eq("id", m.group_id).maybeSingle();
    const groupJid = (group as any)?.group_jid as string | undefined;
    if (!groupJid) throw new Error(`Grupo ${m.group_id} não encontrado no live-launchpad-79`);

    const creds = await loadUazapiCreds();
    if (!creds) throw new Error("UazAPI não configurada");
    const waJid = toGroupJid(groupJid);

    let waMessageId: string | undefined;
    if (m.content_type === "text") {
      const res = await sendText(creds, waJid, m.content_text ?? "");
      waMessageId = res.id;
    } else {
      if (!m.media_url) throw new Error("Mensagem de mídia sem media_url");
      const res = await sendMedia(creds, waJid, CONTENT_TO_MEDIA_TYPE[m.content_type], m.media_url, m.content_text ?? undefined);
      waMessageId = res.id;
    }

    await (supabaseAdmin
      .from("envio_messages" as any) as any)
      .update({ status: "sent", sent_at: new Date().toISOString(), wa_message_id: waMessageId ?? null } as never)
      .eq("id", messageId)
      .eq("status", "sending");
  } catch (error) {
    console.error(`sendOneMessage falhou (${messageId}):`, error);
    await (supabaseAdmin
      .from("envio_messages" as any) as any)
      .update({ status: "failed" } as never)
      .eq("id", messageId)
      .eq("status", "sending");
  }
}

/** Envia sequencialmente com um jitter anti-bloqueio entre grupos (500-1500ms), igual ao
 *  fe-send-message original. */
async function sendMessagesSequentially(messageIds: string[]): Promise<void> {
  for (let i = 0; i < messageIds.length; i++) {
    if (i > 0) await sleep(500 + Math.random() * 1000);
    await sendOneMessage(messageIds[i]!);
  }
}

export async function createAndSendEnvioMessage(input: {
  groupIds: string[];
  contentType: EnvioContentType;
  contentText?: string | undefined;
  mediaUrl?: string | undefined;
  scheduledAt?: string | undefined;
}): Promise<{ messageIds: string[] }> {
  const supabaseAdmin = await admin();
  const isScheduled = Boolean(input.scheduledAt);
  const rows = input.groupIds.map((groupId) => ({
    group_id: groupId,
    content_type: input.contentType,
    content_text: input.contentText ?? null,
    media_url: input.mediaUrl ?? null,
    status: isScheduled ? "pending" : "sending",
    scheduled_at: input.scheduledAt ?? null,
  }));

  const { data, error } = await ((supabaseAdmin.from("envio_messages" as any) as any) as any).insert(rows as never).select("id");
  if (error) throw new Error(error.message);
  const messageIds = (data ?? []).map((r: any) => r.id as string);

  if (!isScheduled) {
    // Precisa ser aguardado (não fire-and-forget): o Cloudflare Workers pode encerrar a execução
    // assim que a resposta HTTP for enviada, deixando a promise em background nunca terminar —
    // a mensagem ficaria presa em "sending" pra sempre.
    await sendMessagesSequentially(messageIds).catch((e) => console.error("createAndSendEnvioMessage: falha no envio", e));
  }

  return { messageIds };
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function uploadEnvioMedia(input: { fileName: string; base64Data: string; contentType: string }): Promise<{ url: string }> {
  const supabaseAdmin = await admin();
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${Date.now()}-${safeName}`;
  const bytes = base64ToUint8Array(input.base64Data);
  const { error } = await supabaseAdmin.storage.from("envio-uploads").upload(path, bytes, { contentType: input.contentType, upsert: false });
  if (error) throw new Error(error.message);
  const { data } = supabaseAdmin.storage.from("envio-uploads").getPublicUrl(path);
  return { url: data.publicUrl };
}

export type MessageFeedback = "good" | "bad";

/** Feedback manual (bom/ruim) sobre uma mensagem já enviada — alimenta o loop de aprendizado
 *  diário (ai-content-queue.server.ts:runAiPlaybookUpdate). */
export async function submitMessageFeedback(input: { envioMessageId: string; feedback: MessageFeedback; note?: string | undefined }): Promise<{ success: true }> {
  const supabaseAdmin = await admin();
  await (supabaseAdmin.from("envio_message_feedback" as any) as any).insert({
    envio_message_id: input.envioMessageId,
    feedback: input.feedback,
    note: input.note ?? null,
  } as never);
  return { success: true };
}

export async function getRecentMessageFeedback(messageIds: string[]): Promise<Record<string, MessageFeedback>> {
  if (messageIds.length === 0) return {};
  const supabaseAdmin = await admin();
  const { data } = await (supabaseAdmin.from("envio_message_feedback" as any) as any)
    .select("envio_message_id, feedback, created_at")
    .in("envio_message_id", messageIds)
    .order("created_at", { ascending: false });
  const map: Record<string, MessageFeedback> = {};
  for (const row of (data ?? []) as any[]) {
    if (!(row.envio_message_id in map)) map[row.envio_message_id] = row.feedback;
  }
  return map;
}

export async function listRecentEnvioMessages(limit = 20): Promise<EnvioMessage[]> {
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin
    .from("envio_messages" as any) as any)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as EnvioMessage[];
}

export async function editPendingEnvioMessage(
  id: string,
  patch: { contentText?: string | undefined; mediaUrl?: string | undefined; scheduledAt?: string | undefined },
): Promise<EnvioMessage> {
  const supabaseAdmin = await admin();
  const { data, error } = await (supabaseAdmin
    .from("envio_messages" as any) as any)
    .update({
      content_text: patch.contentText,
      media_url: patch.mediaUrl,
      scheduled_at: patch.scheduledAt,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", id)
    .eq("status", "pending")
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as EnvioMessage;
}

export async function cancelPendingEnvioMessage(id: string): Promise<{ cancelled: boolean }> {
  const supabaseAdmin = await admin();
  const { count, error } = await (supabaseAdmin
    .from("envio_messages" as any) as any)
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("status", "pending");
  if (error) throw new Error(error.message);
  return { cancelled: (count ?? 0) > 0 };
}

/** Cron: processa envios agendados. Trava atômica via UPDATE ... WHERE status='pending' evita
 *  envio duplicado se o tick sobrepor. */
export async function processDueEnvioMessages(): Promise<{ processed: number; failed: number; skipped: number; total: number }> {
  const supabaseAdmin = await admin();
  const { data: due } = await (supabaseAdmin
    .from("envio_messages" as any) as any)
    .select("id")
    .eq("status", "pending")
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(50);

  const ids = (due ?? []).map((r: any) => r.id as string);
  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const id of ids) {
    const { data: locked } = await (supabaseAdmin
      .from("envio_messages" as any) as any)
      .update({ status: "sending" } as never)
      .eq("id", id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!locked) {
      skipped++;
      continue;
    }
    await sendOneMessage(id);
    const { data: after } = await ((supabaseAdmin.from("envio_messages" as any) as any) as any).select("status").eq("id", id).maybeSingle();
    if ((after as any)?.status === "sent") processed++;
    else failed++;
  }

  return { processed, failed, skipped, total: ids.length };
}
