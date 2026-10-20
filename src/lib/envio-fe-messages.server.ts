/** Envios do Fluxo de Envio feitos pelo painel — gravados em `fe_messages` do Cartzy (live-launchpad), o mesmo
 *  lugar do painel original: assim o histórico, as sequências, o anti-duplicidade e o agendador (cron
 *  `fe-process-scheduled`) são os do Cartzy, que é o motor. Nada aqui depende da tabela local `envio_messages`
 *  (essa fica só com os envios automáticos de IA do CRM). */

export type FeContentType = "text" | "image" | "audio" | "video" | "video_note" | "poll";

export type FeMessage = {
  id: string;
  campaign_id: string | null;
  group_id: string | null;
  content_type: FeContentType;
  content_text: string | null;
  media_url: string | null;
  poll_options: string[] | null;
  poll_selectable_count: number | null;
  status: "pending" | "sending" | "sent" | "failed";
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
  error_message: string | null;
  sequence_step: number;
  delay_seconds: number;
  view_once?: boolean;
};

export type FeScheduledMessage = {
  id: string;
  group_id: string | null;
  campaign_id: string | null;
  content_type: FeContentType;
  content_text: string | null;
  scheduled_at: string;
  created_at: string;
  sequence_step: number;
  delay_seconds: number;
};

export type FeComposerData = {
  groups: { id: string; group_name: string; group_jid: string; last_sent_at: string | null }[];
  campaigns: { id: string; name: string }[];
  messages: FeMessage[];
  scheduled: FeScheduledMessage[];
};

export type FeStepInput = {
  contentType: FeContentType;
  text?: string | undefined;
  mediaUrl?: string | undefined;
  pollOptions?: string[] | undefined;
  pollMultiple?: boolean | undefined;
  viewOnce?: boolean | undefined;
  delaySeconds: number;
};

export type FeSendInput = {
  contentType: FeContentType;
  contentText?: string | undefined;
  mediaUrl?: string | undefined;
  pollOptions?: string[] | undefined;
  pollMultiple?: boolean | undefined;
  viewOnce?: boolean | undefined;
  groupIds?: string[] | undefined;
  campaignId?: string | undefined;
  /** ISO. Ausente = envio imediato. */
  scheduledAt?: string | undefined;
  extraSteps?: FeStepInput[] | undefined;
};

async function admin() {
  const { getLiveLaunchpadAdmin } = await import("@/integrations/supabase/live-launchpad-client.server");
  return getLiveLaunchpadAdmin();
}

async function tenantId() {
  const { MANIA_DE_MULHER_TENANT_ID } = await import("@/integrations/supabase/live-launchpad-client.server");
  return MANIA_DE_MULHER_TENANT_ID;
}

export async function getFeComposerData(): Promise<FeComposerData> {
  const db: any = await admin();
  const tenant = await tenantId();
  const [grp, cmp, msgs, sentAgg, sched] = await Promise.all([
    db.from("fe_groups").select("id, group_name, group_jid").eq("tenant_id", tenant).eq("is_admin", true).order("group_name"),
    db.from("fe_campaigns").select("id, name").eq("tenant_id", tenant).eq("is_active", true).order("name"),
    db.from("fe_messages").select("*").eq("tenant_id", tenant).order("created_at", { ascending: false }).limit(20),
    db.from("fe_messages").select("group_id, sent_at").eq("tenant_id", tenant).not("sent_at", "is", null).order("sent_at", { ascending: false }).limit(2000),
    db
      .from("fe_messages")
      .select("id, group_id, campaign_id, content_type, content_text, scheduled_at, created_at, sequence_step, delay_seconds")
      .eq("tenant_id", tenant)
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true })
      .limit(1000),
  ]);
  for (const result of [grp, cmp, msgs, sentAgg, sched]) if (result.error) throw new Error(result.error.message);

  const lastByGroup = new Map<string, string>();
  for (const row of (sentAgg.data ?? []) as any[]) {
    if (row.group_id && !lastByGroup.has(row.group_id)) lastByGroup.set(row.group_id, row.sent_at);
  }
  return {
    groups: ((grp.data ?? []) as any[]).map((g) => ({ id: g.id, group_name: g.group_name, group_jid: g.group_jid, last_sent_at: lastByGroup.get(g.id) ?? null })),
    campaigns: (cmp.data ?? []) as any[],
    messages: (msgs.data ?? []) as FeMessage[],
    scheduled: (sched.data ?? []) as FeScheduledMessage[],
  };
}

function cleanOptions(options?: string[]): string[] {
  return (options ?? []).map((o) => o.trim()).filter(Boolean);
}

/** Visualização única só existe no WhatsApp para imagem, vídeo e áudio. */
const VIEW_ONCE_TYPES: readonly FeContentType[] = ["image", "video", "audio"];
const wantsViewOnce = (type: FeContentType, flag: boolean | undefined) => Boolean(flag) && VIEW_ONCE_TYPES.includes(type);

function validateContent(label: string, input: { contentType: FeContentType; text?: string | undefined; mediaUrl?: string | undefined; pollOptions?: string[] | undefined; viewOnce?: boolean | undefined }): void {
  if (input.viewOnce && !VIEW_ONCE_TYPES.includes(input.contentType)) throw new Error(`${label}: visualização única vale só para imagem, vídeo e áudio.`);
  if (input.contentType === "text" && !input.text?.trim()) throw new Error(`${label}: escreva a mensagem.`);
  if (input.contentType === "poll") {
    const opts = cleanOptions(input.pollOptions);
    if (!input.text?.trim()) throw new Error(`${label}: escreva a pergunta da enquete.`);
    if (opts.length < 2 || opts.length > 12) throw new Error(`${label}: a enquete precisa de 2 a 12 opções.`);
    if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) throw new Error(`${label}: há opções repetidas na enquete.`);
  } else if (input.contentType !== "text" && !input.mediaUrl) {
    throw new Error(`${label}: anexe um arquivo.`);
  }
}

/** Chama uma edge function do Cartzy (verify_jwt desligado; o tenant vai no corpo). Com `timeoutMs`, desiste de
 *  esperar a resposta (o agendador fica de plantão por ~55 s e não queremos segurar a requisição). */
async function invokeCartzyFunction(name: string, body: Record<string, unknown>, opts?: { timeoutMs?: number }): Promise<{ error?: string }> {
  const db: any = await admin();
  const controller = new AbortController();
  const timer = opts?.timeoutMs ? setTimeout(() => controller.abort(), opts.timeoutMs) : null;
  try {
    const { data, error } = await db.functions.invoke(name, { body, ...(opts?.timeoutMs ? { signal: controller.signal } : {}) });
    if (error) return { error: error.message ?? String(error) };
    if (data?.error) return { error: String(data.error) };
    return {};
  } catch (e: any) {
    return { error: e?.name === "AbortError" ? undefined : String(e?.message ?? e) } as { error?: string };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function sendFeMessages(input: FeSendInput): Promise<{ messageCount: number; groupCount: number; scheduled: boolean; sequence: boolean }> {
  const db: any = await admin();
  const tenant = await tenantId();

  validateContent("Mensagem", { contentType: input.contentType, text: input.contentText, mediaUrl: input.mediaUrl, pollOptions: input.pollOptions, viewOnce: input.viewOnce });
  const extraSteps = input.extraSteps ?? [];
  extraSteps.forEach((step, i) => validateContent(`Mensagem ${i + 2}`, step));

  const isScheduled = Boolean(input.scheduledAt);
  const scheduledMs = isScheduled ? new Date(input.scheduledAt!).getTime() : NaN;
  if (isScheduled && !Number.isFinite(scheduledMs)) throw new Error("Defina data/hora do agendamento.");

  // Grupos de destino: sempre confirmados no tenant (o banco é compartilhado com outros clientes do Cartzy).
  let targetGroupIds: string[];
  if (input.campaignId) {
    const { data: campaign } = await db.from("fe_campaigns").select("id").eq("id", input.campaignId).eq("tenant_id", tenant).maybeSingle();
    if (!campaign) throw new Error("Campanha não encontrada.");
    const { data: links, error } = await db.from("fe_campaign_groups").select("group_id").eq("campaign_id", input.campaignId);
    if (error) throw new Error(error.message);
    targetGroupIds = ((links ?? []) as any[]).map((l) => l.group_id as string);
    if (targetGroupIds.length === 0) throw new Error("Campanha sem grupos associados.");
  } else {
    targetGroupIds = [...new Set(input.groupIds ?? [])];
    if (targetGroupIds.length === 0) throw new Error("Selecione pelo menos um grupo.");
  }
  const { data: ownGroups, error: groupsError } = await db.from("fe_groups").select("id").eq("tenant_id", tenant).in("id", targetGroupIds);
  if (groupsError) throw new Error(groupsError.message);
  const allowed = new Set(((ownGroups ?? []) as any[]).map((g) => g.id as string));
  targetGroupIds = targetGroupIds.filter((id) => allowed.has(id));
  if (targetGroupIds.length === 0) throw new Error("Nenhum grupo encontrado.");

  const sequenceId = extraSteps.length > 0 ? crypto.randomUUID() : null;
  const pollCount = (options?: string[], multiple?: boolean) => (multiple ? cleanOptions(options).length : 1);

  const firstRows = targetGroupIds.map((groupId) => ({
    tenant_id: tenant,
    sequence_id: sequenceId,
    sequence_step: 1,
    group_id: groupId,
    campaign_id: input.campaignId ?? null,
    content_type: input.contentType,
    content_text: input.contentText || null,
    media_url: input.mediaUrl || null,
    view_once: wantsViewOnce(input.contentType, input.viewOnce),
    poll_options: input.contentType === "poll" ? cleanOptions(input.pollOptions) : null,
    poll_selectable_count: input.contentType === "poll" ? pollCount(input.pollOptions, input.pollMultiple) : null,
    status: isScheduled ? "pending" : "sending",
    scheduled_at: isScheduled ? new Date(scheduledMs).toISOString() : null,
  }));
  const { data: inserted, error: insertError } = await db.from("fe_messages").insert(firstRows).select("id, group_id");
  if (insertError) throw new Error(insertError.message);
  const insertedRows = (inserted ?? []) as Array<{ id: string; group_id: string }>;

  // Mensagens seguintes: cada uma depende da anterior do MESMO grupo e espera o tempo definido depois que a
  // anterior for enviada (o agendador do Cartzy respeita a espera com precisão de segundos).
  if (extraSteps.length > 0 && sequenceId) {
    const baseMs = isScheduled ? scheduledMs : Date.now();
    let previousByGroup = new Map(insertedRows.map((m) => [m.group_id, m.id]));
    let cumulative = 0;
    for (let i = 0; i < extraSteps.length; i++) {
      const step = extraSteps[i]!;
      const delay = Math.max(0, Math.round(step.delaySeconds));
      cumulative += delay;
      const rows = targetGroupIds.map((groupId) => ({
        tenant_id: tenant,
        sequence_id: sequenceId,
        sequence_step: i + 2,
        depends_on: previousByGroup.get(groupId) ?? null,
        delay_seconds: delay,
        group_id: groupId,
        campaign_id: input.campaignId ?? null,
        content_type: step.contentType,
        content_text: step.text || null,
        media_url: step.mediaUrl || null,
        view_once: wantsViewOnce(step.contentType, step.viewOnce),
        poll_options: step.contentType === "poll" ? cleanOptions(step.pollOptions) : null,
        poll_selectable_count: step.contentType === "poll" ? pollCount(step.pollOptions, step.pollMultiple) : null,
        status: "pending",
        scheduled_at: new Date(baseMs + cumulative * 1000).toISOString(),
      }));
      const { data: stepRows, error: stepError } = await db.from("fe_messages").insert(rows).select("id, group_id");
      if (stepError) throw new Error(stepError.message);
      previousByGroup = new Map(((stepRows ?? []) as Array<{ id: string; group_id: string }>).map((m) => [m.group_id, m.id]));
    }
  }

  if (!isScheduled) {
    const result = await invokeCartzyFunction("fe-send-message", {
      tenant_id: tenant,
      group_ids: targetGroupIds,
      content_type: input.contentType,
      content_text: input.contentText,
      media_url: input.mediaUrl,
      poll_options: input.contentType === "poll" ? cleanOptions(input.pollOptions) : undefined,
      poll_selectable_count: input.contentType === "poll" ? pollCount(input.pollOptions, input.pollMultiple) : undefined,
      mention_all: false,
      message_ids: targetGroupIds.map((groupId) => insertedRows.find((m) => m.group_id === groupId)?.id),
      async: true,
    });
    if (result.error) {
      // Não deixa as mensagens presas em "sending": marca como falha com o motivo.
      await db
        .from("fe_messages")
        .update({ status: "failed", error_message: String(result.error).slice(0, 300) })
        .in("id", insertedRows.map((m) => m.id))
        .eq("status", "sending");
      throw new Error(result.error);
    }
    // Aciona já o agendador das etapas seguintes (o cron também pega em até 1 minuto).
    if (extraSteps.length > 0) await invokeCartzyFunction("fe-process-scheduled", {}, { timeoutMs: 2500 });
  }

  return {
    messageCount: insertedRows.length * (1 + extraSteps.length),
    groupCount: targetGroupIds.length,
    scheduled: isScheduled,
    sequence: extraSteps.length > 0,
  };
}

export async function cancelFeMessages(ids: string[]): Promise<{ cancelled: number }> {
  if (ids.length === 0) return { cancelled: 0 };
  const db: any = await admin();
  const tenant = await tenantId();
  const { error, count } = await db.from("fe_messages").delete({ count: "exact" }).in("id", ids).eq("tenant_id", tenant).eq("status", "pending");
  if (error) throw new Error(error.message);
  return { cancelled: count ?? 0 };
}

export async function updateFePendingMessage(input: {
  id: string;
  contentType: FeContentType;
  contentText?: string | undefined;
  mediaUrl?: string | undefined;
  pollOptions?: string[] | undefined;
  pollMultiple?: boolean | undefined;
  viewOnce?: boolean | undefined;
  scheduledAt?: string | null | undefined;
}): Promise<{ updated: boolean }> {
  validateContent("Mensagem", { contentType: input.contentType, text: input.contentText, mediaUrl: input.mediaUrl, pollOptions: input.pollOptions, viewOnce: input.viewOnce });
  const db: any = await admin();
  const tenant = await tenantId();
  const { data, error } = await db
    .from("fe_messages")
    .update({
      content_type: input.contentType,
      content_text: input.contentText || null,
      media_url: input.mediaUrl || null,
      view_once: wantsViewOnce(input.contentType, input.viewOnce),
      poll_options: input.contentType === "poll" ? cleanOptions(input.pollOptions) : null,
      poll_selectable_count: input.contentType === "poll" ? (input.pollMultiple ? cleanOptions(input.pollOptions).length : 1) : null,
      scheduled_at: input.scheduledAt ? new Date(input.scheduledAt).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("tenant_id", tenant)
    .eq("status", "pending")
    .select("id");
  if (error) throw new Error(error.message);
  return { updated: ((data ?? []) as unknown[]).length > 0 };
}

/** Endereço assinado para o navegador enviar o arquivo direto ao bucket `product-images` do Cartzy (o arquivo
 *  não passa pelo servidor, que tem limite de tamanho). Mesmo caminho do painel original: <tenant>/<timestamp>.<ext>. */
export async function createFeMediaUpload(input: { fileName: string; size: number }): Promise<{ signedUrl: string; publicUrl: string }> {
  if (input.size > 100 * 1024 * 1024) throw new Error("Arquivo grande demais (máximo 100 MB).");
  const db: any = await admin();
  const tenant = await tenantId();
  const ext = (input.fileName.split(".").pop() || "bin").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "bin";
  const path = `${tenant}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { data, error } = await db.storage.from("product-images").createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? "Não consegui preparar o envio do arquivo.");
  const { data: pub } = db.storage.from("product-images").getPublicUrl(path);
  return { signedUrl: data.signedUrl as string, publicUrl: pub.publicUrl as string };
}
