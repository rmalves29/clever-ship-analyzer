import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";

const bodyExampleSchema = z.object({
  body_text: z.array(z.array(z.string().min(1))).min(1),
});

const templateComponentSchema = z.union([
  z.object({ type: z.literal("HEADER"), format: z.literal("TEXT"), text: z.string().min(1) }),
  z.object({
    type: z.literal("BODY"),
    text: z.string().min(1),
    example: bodyExampleSchema.optional(),
  }),
  z.object({ type: z.literal("FOOTER"), text: z.string().min(1) }),
  z.object({
    type: z.literal("BUTTONS"),
    buttons: z.array(z.object({ type: z.literal("QUICK_REPLY"), text: z.string().min(1) })).min(1),
  }),
]);

/**
 * Versão do criador de template que preserva `BODY.example.body_text`.
 * O endpoint antigo usa um schema que remove esse campo antes de chamar a Meta.
 */
export const createMetaTemplateWithVariables = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z
      .object({
        name: z.string().min(1),
        category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
        language: z.string().min(2),
        components: z.array(templateComponentSchema).min(1),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { createTemplate } = await import("./whatsapp-meta.server");
    return createTemplate(data as never);
  });
