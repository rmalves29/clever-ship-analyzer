import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";
import { normalizeWhatsappAudienceSelection } from "./whatsapp-audience-selection";

export const previewWhatsappAudience = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z.object({
      segmentType: z.string(),
      segmentId: z.string().uuid().optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const selection = normalizeWhatsappAudienceSelection(data.segmentType, data.segmentId);
    const { resolveWhatsappSegmentAudience } = await import("./whatsapp-segment-resolver.server");
    const audience = await resolveWhatsappSegmentAudience(selection.segmentType, selection.segmentId);
    return {
      clientes: audience.clientes,
      comTelefone: audience.comTelefone,
      destinatarios: audience.destinatarios,
      recipientSamples: audience.recipientSamples,
    };
  });
