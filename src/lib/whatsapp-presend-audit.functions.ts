import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";

const auditSchema = z.object({
  segmentType: z.string().min(1),
  segmentId: z.string().uuid().optional(),
  messageType: z.enum(["marketing", "utility"]).default("marketing"),
});

/** Apenas calcula o público; não cria campanha, não enfileira e não chama a API da Meta. */
export const previewWhatsappPresendAudit = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => auditSchema.parse(data))
  .handler(async ({ data }) => {
    const { resolveWhatsappSegmentAudit } = await import("./whatsapp-segment-resolver.server");
    const audit = await resolveWhatsappSegmentAudit(data.segmentType, data.segmentId, data.messageType);
    return {
      clientes: audit.clientes,
      comTelefone: audit.comTelefone,
      destinatarios: audit.destinatarios,
      invalidPhone: audit.invalidPhone,
      duplicatePhones: audit.duplicatePhones,
      marketingOptOuts: audit.marketingOptOuts,
      eligibleRecipients: audit.eligibleRecipients,
      messageType: data.messageType,
    };
  });
