import { summarizeWhatsappQueue } from "./whatsapp-queue-health";

const QUEUE_TABLE = "whatsapp_message_queue";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function getWhatsappQueueHealthSnapshot() {
  const db = await admin();
  const [{ data: rows, error }, { data: campaigns, error: campaignsError }] = await Promise.all([
    db
      .from(QUEUE_TABLE)
      .select("campaign_id, status, error, attempts, max_attempts, scheduled_at, next_attempt_at, created_at")
      .order("created_at", { ascending: false })
      .limit(10000),
    db
      .from("whatsapp_campaigns")
      .select("id, nome, status, message_type, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (error) throw new Error(`Erro ao carregar a fila do WhatsApp: ${error.message}`);
  if (campaignsError) throw new Error(`Erro ao carregar campanhas do WhatsApp: ${campaignsError.message}`);

  const queueRows = rows ?? [];
  const summary = summarizeWhatsappQueue(queueRows);
  const byCampaign = new Map<string, { queued: number; sending: number; retry: number; sent: number; failed: number; skipped: number; cancelled: number }>();
  for (const row of queueRows) {
    if (!row.campaign_id) continue;
    const entry = byCampaign.get(String(row.campaign_id)) ?? {
      queued: 0,
      sending: 0,
      retry: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      cancelled: 0,
    };
    if (row.status === "queued") entry.queued++;
    else if (row.status === "sending") entry.sending++;
    else if (row.status === "retry_wait") entry.retry++;
    else if (row.status === "sent") entry.sent++;
    else if (row.status === "failed") entry.failed++;
    else if (row.status === "skipped") entry.skipped++;
    else if (row.status === "cancelled") entry.cancelled++;
    byCampaign.set(String(row.campaign_id), entry);
  }

  return {
    ...summary,
    campaigns: (campaigns ?? []).map((campaign: any) => ({
      id: String(campaign.id),
      nome: String(campaign.nome ?? "Campanha"),
      status: String(campaign.status ?? ""),
      messageType: String(campaign.message_type ?? "marketing"),
      createdAt: campaign.created_at as string | null,
      queue: byCampaign.get(String(campaign.id)) ?? {
        queued: 0,
        sending: 0,
        retry: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        cancelled: 0,
      },
    })),
  };
}

export async function pauseWhatsappCampaignQueue(campaignId: string) {
  const db = await admin();
  const { data: row } = await db.from("whatsapp_campaigns").select("id").eq("id", campaignId).maybeSingle();
  if (!row) return { success: false as const, error: "Campanha não encontrada." };
  const { error } = await db
    .from("whatsapp_campaigns")
    .update({ status: "pausada", updated_at: new Date().toISOString() })
    .eq("id", campaignId);
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

export async function resumeWhatsappCampaignQueue(campaignId: string) {
  const db = await admin();
  const { data: row } = await db.from("whatsapp_campaigns").select("id, status").eq("id", campaignId).maybeSingle();
  if (!row) return { success: false as const, error: "Campanha não encontrada." };
  if (row.status !== "pausada") return { success: false as const, error: "A campanha não está pausada." };

  const { error } = await db
    .from("whatsapp_campaigns")
    .update({ status: "enviando", updated_at: new Date().toISOString() })
    .eq("id", campaignId);
  if (error) return { success: false as const, error: error.message };

  const { refreshCampaignStatus } = await import("./whatsapp-queue.server");
  const status = await refreshCampaignStatus(campaignId);
  return { success: true as const, status };
}

export async function retryFailedWhatsappCampaignQueue(campaignId: string) {
  const db = await admin();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from(QUEUE_TABLE)
    .update({
      status: "retry_wait",
      attempts: 0,
      next_attempt_at: now,
      error: null,
      locked_by: null,
      locked_at: null,
      updated_at: now,
    })
    .eq("campaign_id", campaignId)
    .eq("status", "failed")
    .select("id, status");
  if (error) return { success: false as const, error: error.message };

  await db.from("whatsapp_campaigns").update({ status: "enviando", updated_at: now }).eq("id", campaignId);
  const { refreshCampaignStatus } = await import("./whatsapp-queue.server");
  await refreshCampaignStatus(campaignId);
  return { success: true as const, retried: (data ?? []).filter((row: any) => row.status === "retry_wait").length };
}
