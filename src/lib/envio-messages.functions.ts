import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const contentTypeSchema = z.enum(["text", "image", "audio", "video", "video_note"]);

export const createAndSendEnvioMessage = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        groupIds: z.array(z.string().uuid()).min(1),
        contentType: contentTypeSchema,
        contentText: z.string().optional(),
        mediaUrl: z.string().optional(),
        scheduledAt: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { createAndSendEnvioMessage: create } = await import("./envio-messages.server");
    return create(data);
  });

export const listRecentEnvioMessages = createServerFn({ method: "GET" }).handler(async () => {
  const { listRecentEnvioMessages: list } = await import("./envio-messages.server");
  return list();
});

export const submitMessageFeedback = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ envioMessageId: z.string().uuid(), feedback: z.enum(["good", "bad"]), note: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { submitMessageFeedback: submit } = await import("./envio-messages.server");
    return submit(data);
  });

export const getRecentMessageFeedback = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ messageIds: z.array(z.string().uuid()) }).parse(data))
  .handler(async ({ data }) => {
    const { getRecentMessageFeedback: get } = await import("./envio-messages.server");
    return get(data.messageIds);
  });

export const editPendingEnvioMessage = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({ id: z.string().uuid(), contentText: z.string().optional(), mediaUrl: z.string().optional(), scheduledAt: z.string().optional() })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { editPendingEnvioMessage: edit } = await import("./envio-messages.server");
    const { id, ...patch } = data;
    return edit(id, patch);
  });

export const cancelPendingEnvioMessage = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { cancelPendingEnvioMessage: cancel } = await import("./envio-messages.server");
    return cancel(data.id);
  });

export const uploadEnvioMedia = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ fileName: z.string().max(200), base64Data: z.string(), contentType: z.string().max(100) }).parse(data))
  .handler(async ({ data }) => {
    const { uploadEnvioMedia: upload } = await import("./envio-messages.server");
    return upload(data);
  });
