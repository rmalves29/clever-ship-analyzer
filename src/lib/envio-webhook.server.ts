import { fromGroupJid } from "./envio-uazapi.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** O payload de "messages"/"connection"/"presence" é documentado (vault "UazAPI GO.md"); o de
 *  "groups" (entrada/saída de participante) e a marcação de resposta citada dentro de "messages"
 *  NÃO têm schema confirmado publicamente — checagens abaixo tentam vários nomes de campo
 *  plausíveis e não derrubam o webhook se nada bater (só loga e ignora). Ajustar aqui assim que
 *  tráfego real do webhook for observado em produção. */
export async function processEnvioWebhookEvent(body: any): Promise<void> {
  const event = body?.event;
  const data = body?.data;
  if (!event || !data) return;

  if (event === "groups") {
    await handleGroupEvent(data);
    return;
  }

  if (event === "messages") {
    await handleMessageEvent(data);
    return;
  }
}

async function handleGroupEvent(data: any): Promise<void> {
  const groupJidRaw: string | undefined = data.groupjid ?? data.GroupJID ?? data.JID;
  const action: string | undefined = data.action ?? data.type;
  const participant: string | undefined = data.participant ?? data.phone ?? data.PhoneNumber;
  if (!groupJidRaw || !action) {
    console.log("envio-webhook: evento 'groups' com formato inesperado, ignorado", data);
    return;
  }

  const eventType: "join" | "leave" | null =
    action === "add" || action === "join" ? "join" : action === "remove" || action === "leave" ? "leave" : null;
  if (!eventType) return;

  const phone = participant ? participant.replace(/@.*/, "") : `unknown-${Date.now()}`;
  const groupJid = fromGroupJid(groupJidRaw);

  const supabaseAdmin = await admin();
  const { data: group } = await ((supabaseAdmin.from("envio_groups" as any) as any) as any).select("id").eq("group_jid", groupJid).maybeSingle();
  const groupId = (group as any)?.id ?? null;

  await ((supabaseAdmin.from("envio_group_events" as any) as any) as any).insert({ group_id: groupId, group_jid: groupJid, phone, event_type: eventType } as never);

  const { triggerReturnAutomationOnGroupEvent } = await import("./envio-return-automation.server");
  await triggerReturnAutomationOnGroupEvent({ groupId, groupJid, phone, eventType }).catch((error) =>
    console.error("envio-webhook: falha ao disparar automação de retorno", error),
  );
}

async function handleMessageEvent(data: any): Promise<void> {
  const fromMe = data?.key?.fromMe ?? data?.fromMe;
  if (fromMe) return; // só nos interessa resposta de participante, não eco do próprio envio

  const quotedId: string | undefined =
    data?.message?.extendedTextMessage?.contextInfo?.stanzaId ?? data?.contextInfo?.stanzaId ?? data?.quotedMessageId;
  if (!quotedId) return;

  const supabaseAdmin = await admin();
  const { data: original } = await ((supabaseAdmin.from("envio_messages" as any) as any) as any).select("id, group_id").eq("wa_message_id", quotedId).maybeSingle();
  if (!original) return;

  const groupJidRaw: string | undefined = data?.key?.remoteJid;
  const participantRaw: string | undefined = data?.key?.participant ?? data?.pushName;
  const phone = (data?.key?.participant ?? "").replace(/@.*/, "") || "desconhecido";
  const replyText: string | undefined = data?.message?.conversation ?? data?.message?.extendedTextMessage?.text;

  await ((supabaseAdmin.from("envio_message_replies" as any) as any) as any).insert({
    envio_message_id: (original as any).id,
    group_id: (original as any).group_id,
    participant_phone: phone,
    participant_name: data?.pushName ?? null,
    quoted_message_id: quotedId,
    reply_text: replyText ?? null,
    replied_at: new Date().toISOString(),
  } as never);
}
