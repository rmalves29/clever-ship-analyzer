import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { z } from "zod";

const contentTypeSchema = z.enum(["text", "image", "audio", "video", "video_note", "poll"]);

const stepSchema = z.object({
  contentType: contentTypeSchema,
  text: z.string().max(4096).optional(),
  mediaUrl: z.string().max(2000).optional(),
  pollOptions: z.array(z.string().max(100)).max(12).optional(),
  pollMultiple: z.boolean().optional(),
  delaySeconds: z.number().int().min(0).max(86_400),
});

export const getEnvioComposerData = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { getFeComposerData } = await import("./envio-fe-messages.server");
    return getFeComposerData();
  });

export const sendEnvioMessages = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z
      .object({
        contentType: contentTypeSchema,
        contentText: z.string().max(4096).optional(),
        mediaUrl: z.string().max(2000).optional(),
        pollOptions: z.array(z.string().max(100)).max(12).optional(),
        pollMultiple: z.boolean().optional(),
        groupIds: z.array(z.string().uuid()).max(500).optional(),
        campaignId: z.string().uuid().optional(),
        scheduledAt: z.string().max(40).optional(),
        extraSteps: z.array(stepSchema).max(4).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { sendFeMessages } = await import("./envio-fe-messages.server");
    return sendFeMessages(data);
  });

export const cancelEnvioScheduledMessages = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(1000) }).parse(data))
  .handler(async ({ data }) => {
    const { cancelFeMessages } = await import("./envio-fe-messages.server");
    return cancelFeMessages(data.ids);
  });

export const updateEnvioPendingMessage = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        contentType: contentTypeSchema,
        contentText: z.string().max(4096).optional(),
        mediaUrl: z.string().max(2000).optional(),
        pollOptions: z.array(z.string().max(100)).max(12).optional(),
        pollMultiple: z.boolean().optional(),
        scheduledAt: z.string().max(40).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { updateFePendingMessage } = await import("./envio-fe-messages.server");
    return updateFePendingMessage(data);
  });

export const createEnvioMediaUpload = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ fileName: z.string().min(1).max(200), size: z.number().int().positive() }).parse(data))
  .handler(async ({ data }) => {
    const { createFeMediaUpload } = await import("./envio-fe-messages.server");
    return createFeMediaUpload(data);
  });
