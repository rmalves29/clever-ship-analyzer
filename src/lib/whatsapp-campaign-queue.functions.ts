import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const messageTypeSchema = z.enum(["marketing", "utility"]);
const createCampaignSchema = z.object({
  nome: z.string().min(1), segmentType: z.string(), segmentId: z.string().uuid().optional(), messageType: messageTypeSchema.default("marketing"),
  templateName: z.string().optional(), templateLanguage: z.string().optional(), couponCode: z.string().optional(), bodyParams: z.array(z.string()).max(10).default([]),
  requireApproval: z.boolean().default(false), sendAt: z.string().optional(),
});

/** Cria a campanha. Envio imediato apenas cria jobs; nenhuma chamada à Meta ocorre nesta request. */
export const createAndQueueCampaign = createServerFn({ method: "POST" }).validator((data: unknown) => createCampaignSchema.parse(data)).handler(async ({ data }) => {
  const { createCampaignRow, loadSettings } = await import("./whatsapp-meta.server");
  const { enqueueWhatsAppCampaign } = await import("./whatsapp-queue.server");
  const created = await createCampaignRow({ nome: data.nome, segmentType: data.segmentType, segmentId: data.segmentId, messageType: data.messageType, templateName: data.templateName, templateLanguage: data.templateLanguage, bodyParams: data.bodyParams, couponCode: data.couponCode, origem: "crm" }, data.sendAt ? "agendada" : data.requireApproval ? "aguardando_aprovacao" : "enviando");
  if (!created.success) return created;
  if (data.requireApproval || data.sendAt) return { success: true as const, pendingApproval: data.requireApproval, scheduled: Boolean(data.sendAt), campaignId: created.campaignId, total: created.destinatarios, sent: 0, failed: 0, queued: 0 };
  const settings = await loadSettings();
  const templateName = data.templateName?.trim() || settings.templateName;
  const templateLanguage = data.templateLanguage?.trim() || settings.templateLanguage;
  if (!templateName) return { success: false as const, error: "Template do WhatsApp não configurado." };
  const queued = await enqueueWhatsAppCampaign({ campaignId: created.campaignId, segmentType: data.segmentType, segmentId: data.segmentId, templateName, templateLanguage, bodyParams: data.bodyParams });
  return { success: true as const, pendingApproval: false as const, scheduled: false as const, campaignId: created.campaignId, total: queued.total, queued: queued.total, sent: 0, failed: 0 };
});

/** Aprovação também é queue-only: atualiza a campanha e cria jobs, sem chamar a Meta. */
export const approveCampaignViaQueue = createServerFn({ method: "POST" }).validator((data: unknown) => z.object({ campaignId: z.string().uuid(), approvedBy: z.string().optional() }).parse(data)).handler(async ({ data }) => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { loadSettings } = await import("./whatsapp-meta.server");
  const { enqueueWhatsAppCampaign } = await import("./whatsapp-queue.server");
  const { advanceRunsForApprovedCampaign } = await import("./automations-engine.server");
  const { data: row } = await supabaseAdmin.from("whatsapp_campaigns").select("id,status,segment_type,segment_id,message_type,template_name,template_language,body_params").eq("id", data.campaignId).maybeSingle();
  if (!row) return { success: false as const, error: "Campanha não encontrada." };
  if ((row as any).status !== "aguardando_aprovacao") return { success: false as const, error: "Essa campanha não está aguardando aprovação." };
  const { error } = await supabaseAdmin.from("whatsapp_campaigns").update({ approved_at: new Date().toISOString(), approved_by: data.approvedBy ?? "painel", status: "enviando" } as never).eq("id", data.campaignId).eq("status", "aguardando_aprovacao");
  if (error) return { success: false as const, error: error.message };
  const { data: pendingRuns } = await supabaseAdmin.from("whatsapp_automation_runs").select("customer_id").eq("campaign_id", data.campaignId).eq("status", "pending_approval");
  const customerIds = ((pendingRuns ?? []) as { customer_id: string }[]).map((r) => r.customer_id);
  const settings = await loadSettings();
  const queued = await enqueueWhatsAppCampaign({ campaignId: data.campaignId, segmentType: String((row as any).segment_type), segmentId: (row as any).segment_id ?? undefined, templateName: (row as any).template_name ?? settings.templateName, templateLanguage: (row as any).template_language ?? settings.templateLanguage, bodyParams: Array.isArray((row as any).body_params) ? (row as any).body_params : [], customerIds: customerIds.length ? customerIds : undefined });
  if (customerIds.length) await advanceRunsForApprovedCampaign(data.campaignId);
  return { success: true as const, campaignId: data.campaignId, total: queued.total, queued: queued.total, sent: 0, failed: 0 };
});
