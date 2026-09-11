/**
 * Camada de leitura/ação da nova estrutura de campanhas (wa_campaigns / wa_campaign_recipients /
 * wa_jobs). As telas de /whatsapp falam SÓ com este arquivo — nada de ler as tabelas antigas.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";

export type WaCampaignListRow = {
  id: string;
  name: string;
  status: string;
  origin: string;
  audienceLabel: string | null;
  templateName: string;
  templateLanguage: string;
  messageType: string;
  campaignTag: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  createdAt: string;
  queuePaused: boolean;
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  pending: number;
  /** Valor vendido atribuído (pedidos pagos até 30 dias após o envio). */
  revenue: number;
  orders: number;
};

/** Janela de atribuição de vendas, em dias. */
export const WA_REVENUE_WINDOW_DAYS = 30;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any; rpc: (fn: string, args?: any) => any };
}

async function revenueByCampaign(supabaseAdmin: { rpc: (fn: string, args?: any) => any }) {
  const map = new Map<string, { revenue: number; orders: number }>();
  const { data, error } = await supabaseAdmin.rpc("wa_campaign_revenue", { p_window_days: WA_REVENUE_WINDOW_DAYS });
  if (error) return map;
  for (const row of ((data ?? []) as any[])) {
    map.set(row.campaign_id, { revenue: Number(row.revenue ?? 0), orders: Number(row.orders ?? 0) });
  }
  return map;
}

function mapRow(row: any, pending: number, revenue?: { revenue: number; orders: number }): WaCampaignListRow {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    origin: row.origin ?? "crm",
    audienceLabel: row.audience_label ?? null,
    templateName: row.template_name ?? "",
    templateLanguage: row.template_language ?? "pt_BR",
    messageType: row.message_type ?? "marketing",
    campaignTag: row.campaign_tag ?? null,
    scheduledAt: row.scheduled_at ?? null,
    sentAt: row.sent_at ?? null,
    createdAt: row.created_at,
    queuePaused: Boolean(row.queue_paused),
    total: Number(row.total_recipients ?? 0),
    sent: Number(row.sent_count ?? 0),
    delivered: Number(row.delivered_count ?? 0),
    read: Number(row.read_count ?? 0),
    failed: Number(row.failed_count ?? 0),
    pending,
  };
}

/** Lista consolidada — uma única tela pra tudo (não existe mais aba "Aprovações"). */
export const listWaCampaigns = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async (): Promise<WaCampaignListRow[]> => {
    const supabaseAdmin = await admin();
    const { data, error } = await supabaseAdmin
      .from("wa_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    if (rows.length === 0) return [];

    const { data: jobs } = await supabaseAdmin
      .from("wa_jobs")
      .select("campaign_id")
      .in("status", ["queued", "retry_wait", "sending"])
      .in("campaign_id", rows.map((r) => r.id));
    const pendingByCampaign = new Map<string, number>();
    for (const job of ((jobs ?? []) as any[])) {
      pendingByCampaign.set(job.campaign_id, (pendingByCampaign.get(job.campaign_id) ?? 0) + 1);
    }
    return rows.map((row) => mapRow(row, pendingByCampaign.get(row.id) ?? 0));
  });

/** Campanha aberta: cabeçalho + destinatários reais com motivo de falha. */
export const getWaCampaign = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ campaignId: z.string().uuid(), status: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const supabaseAdmin = await admin();
    const { data: row, error } = await supabaseAdmin.from("wa_campaigns").select("*").eq("id", data.campaignId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Campanha não encontrada.");

    let query = supabaseAdmin
      .from("wa_campaign_recipients")
      .select("id, name, phone, status, error_code, error_message, sent_at, delivered_at, read_at")
      .eq("campaign_id", data.campaignId)
      .order("updated_at", { ascending: false })
      .limit(300);
    if (data.status && data.status !== "todos") query = query.eq("status", data.status);
    const { data: recipients } = await query;

    const { count: pending } = await supabaseAdmin
      .from("wa_jobs")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", data.campaignId)
      .in("status", ["queued", "retry_wait", "sending"]);

    return {
      campaign: mapRow(row, pending ?? 0),
      bodyParams: ((row as any).body_params ?? []) as string[],
      bodyParamTokens: ((row as any).body_param_tokens ?? []) as string[],
      lastError: ((row as any).last_error ?? null) as string | null,
      rejectReason: ((row as any).reject_reason ?? null) as string | null,
      recipients: ((recipients ?? []) as any[]).map((r) => ({
        id: r.id as string,
        name: (r.name ?? null) as string | null,
        phone: r.phone as string,
        status: r.status as string,
        errorCode: (r.error_code ?? null) as string | null,
        errorMessage: (r.error_message ?? null) as string | null,
        sentAt: (r.sent_at ?? null) as string | null,
        deliveredAt: (r.delivered_at ?? null) as string | null,
        readAt: (r.read_at ?? null) as string | null,
      })),
    };
  });

/** Ações da campanha aberta, todas no motor novo. */
export const waCampaignAction = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z.object({ campaignId: z.string().uuid(), action: z.enum(["retry", "cancel", "pause", "resume", "refresh"]) }).parse(data),
  )
  .handler(async ({ data }) => {
    const engine = await import("./wa-campaigns.server");
    if (data.action === "retry") return { ...(await engine.retryFailedRecipients(data.campaignId)), success: true as const };
    if (data.action === "cancel") return { ...(await engine.cancelCampaignQueue(data.campaignId)), success: true as const };
    if (data.action === "refresh") {
      await engine.refreshCampaignStatus(data.campaignId);
      return { success: true as const };
    }
    const supabaseAdmin = await admin();
    const { error } = await supabaseAdmin
      .from("wa_campaigns")
      .update({ queue_paused: data.action === "pause" })
      .eq("id", data.campaignId);
    if (error) throw new Error(error.message);
    return { success: true as const };
  });
