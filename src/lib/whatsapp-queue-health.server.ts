import { summarizeWhatsappQueue } from "./whatsapp-queue-health";

const JOBS_TABLE = "wa_jobs";
const CAMPAIGNS_TABLE = "wa_campaigns";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** O motor novo chama de "done" o job concluído; o painel continua falando "sent". */
function normalizeStatus(status: string): string {
  return status === "done" ? "sent" : status;
}

export async function getWhatsappQueueHealthSnapshot() {
  const db = await admin();
  const [{ data: rows, error }, { data: campaigns, error: campaignsError }] = await Promise.all([
    db
      .from(JOBS_TABLE)
      .select("campaign_id, status, error, attempts, max_attempts, scheduled_at, next_attempt_at, created_at")
      .order("created_at", { ascending: false })
      .limit(10000),
    db
      .from(CAMPAIGNS_TABLE)
      .select("id, name, status, message_type, queue_paused, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (error) throw new Error(`Erro ao carregar a fila do WhatsApp: ${error.message}`);
  if (campaignsError) throw new Error(`Erro ao carregar campanhas do WhatsApp: ${campaignsError.message}`);

  const queueRows = (rows ?? []).map((row: any) => ({ ...row, status: normalizeStatus(String(row.status)) }));
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
      nome: String(campaign.name ?? "Campanha"),
      status: String(campaign.status ?? ""),
      paused: campaign.queue_paused === true,
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
  const { data: row } = await db.from(CAMPAIGNS_TABLE).select("id").eq("id", campaignId).maybeSingle();
  if (!row) return { success: false as const, error: "Campanha não encontrada." };
  const { error } = await db.from(CAMPAIGNS_TABLE).update({ queue_paused: true }).eq("id", campaignId);
  if (error) return { success: false as const, error: error.message };
  await db.from("whatsapp_campaigns").update({ queue_paused: true }).eq("id", campaignId);
  return { success: true as const };
}

export async function resumeWhatsappCampaignQueue(campaignId: string) {
  const db = await admin();
  const { data: row } = await db.from(CAMPAIGNS_TABLE).select("id, queue_paused").eq("id", campaignId).maybeSingle();
  if (!row) return { success: false as const, error: "Campanha não encontrada." };
  if (row.queue_paused !== true) return { success: false as const, error: "A fila desta campanha não está pausada." };

  const { error } = await db.from(CAMPAIGNS_TABLE).update({ queue_paused: false }).eq("id", campaignId);
  if (error) return { success: false as const, error: error.message };
  await db.from("whatsapp_campaigns").update({ queue_paused: false }).eq("id", campaignId);

  const { refreshCampaignStatus } = await import("./wa-campaigns.server");
  const status = await refreshCampaignStatus(campaignId);
  return { success: true as const, status };
}

export async function retryFailedWhatsappCampaignQueue(campaignId: string) {
  const { retryFailedRecipients } = await import("./wa-campaigns.server");
  const result = await retryFailedRecipients(campaignId);
  if (!result.success) return result;
  return { success: true as const, retried: result.requeued };
}

