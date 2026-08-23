import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const messageTypeSchema = z.enum(["marketing", "utility"]);

const createCampaignSchema = z.object({
  nome: z.string().min(1),
  segmentType: z.string(),
  segmentId: z.string().uuid().optional(),
  messageType: messageTypeSchema.default("marketing"),
  templateName: z.string().optional(),
  templateLanguage: z.string().optional(),
  couponCode: z.string().optional(),
  bodyParams: z.array(z.string()).max(10).default([]),
  requireApproval: z.boolean().default(false),
  sendAt: z.string().optional(),
});

/**
 * Cria a campanha e, quando o envio é imediato, apenas enfileira os destinatários.
 * Nenhuma chamada à Meta é feita dentro desta request.
 */
export const createAndQueueCampaign = createServerFn({ method: "POST" })
  .validator((data: unknown) => createCampaignSchema.parse(data))
  .handler(async ({ data }) => {
    const { createCampaignRow, loadSettings } = await import("./whatsapp-meta.server");
    const { enqueueWhatsAppCampaign } = await import("./whatsapp-queue.server");

    const created = await createCampaignRow(
      {
        nome: data.nome,
        segmentType: data.segmentType,
        segmentId: data.segmentId,
        messageType: data.messageType,
        templateName: data.templateName,
        templateLanguage: data.templateLanguage,
        bodyParams: data.bodyParams,
        couponCode: data.couponCode,
        origem: "crm",
      },
      data.sendAt ? "agendada" : data.requireApproval ? "aguardando_aprovacao" : "enviando",
    );

    if (!created.success) return created;

    if (data.requireApproval || data.sendAt) {
      return {
        success: true as const,
        pendingApproval: data.requireApproval,
        scheduled: Boolean(data.sendAt),
        campaignId: created.campaignId,
        total: created.destinatarios,
        sent: 0,
        failed: 0,
        queued: 0,
      };
    }

    const settings = await loadSettings();
    const templateName = data.templateName?.trim() || settings.templateName;
    const templateLanguage = data.templateLanguage?.trim() || settings.templateLanguage;
    if (!templateName) return { success: false as const, error: "Template do WhatsApp não configurado." };

    const queued = await enqueueWhatsAppCampaign({
      campaignId: created.campaignId,
      segmentType: data.segmentType,
      segmentId: data.segmentId,
      templateName,
      templateLanguage,
      bodyParams: data.bodyParams,
    });

    return {
      success: true as const,
      pendingApproval: false as const,
      scheduled: false as const,
      campaignId: created.campaignId,
      total: queued.total,
      queued: queued.total,
      sent: 0,
      failed: 0,
    };
  });
