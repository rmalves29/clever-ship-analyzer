import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido.");
const queueTextSchema = z
  .string()
  .trim()
  .min(1, "A mensagem não pode ficar vazia.")
  .max(500, "A mensagem deve ter no máximo 500 caracteres.")
  .refine((text) => text.split(/\r?\n/).length <= 6, "A mensagem deve ter no máximo 6 linhas.");

export const generateAiContentBatchFn = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z
      .object({
        campaignId: z.string().uuid("Campanha inválida."),
        mode: z.enum(["day", "week"]),
        startDate: dateSchema,
        timeOfDay: timeSchema,
        brandName: z.string().trim().min(1).max(100),
        brandVoice: z.string().trim().min(1).max(500),
        audience: z.string().trim().min(1).max(800),
        campaignObjective: z.string().trim().min(1).max(800),
        funnelStage: z.enum(["descoberta", "consideracao", "conversao", "fidelizacao"]),
        prohibitedClaims: z.string().trim().max(1_000),
      })
      .strict()
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { generateAiContentBatch } = await import("./ai-content-queue.server");
    return generateAiContentBatch(data);
  });

export const listContentQueueBatchFn = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ batchId: z.string().uuid() }).strict().parse(data))
  .handler(async ({ data }) => {
    const { listContentQueueBatch } = await import("./ai-content-queue.server");
    return listContentQueueBatch(data.batchId);
  });

export const updateContentQueueItemTextFn = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid(), contentText: queueTextSchema }).strict().parse(data))
  .handler(async ({ data }) => {
    const { updateContentQueueItemText } = await import("./ai-content-queue.server");
    return updateContentQueueItemText(data.id, data.contentText);
  });

export const approveContentQueueItemFn = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).strict().parse(data))
  .handler(async ({ data }) => {
    const { approveContentQueueItem } = await import("./ai-content-queue.server");
    return approveContentQueueItem(data.id);
  });

export const approveContentQueueBatchFn = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ batchId: z.string().uuid() }).strict().parse(data))
  .handler(async ({ data }) => {
    const { approveContentQueueBatch } = await import("./ai-content-queue.server");
    return approveContentQueueBatch(data.batchId);
  });

export const rejectContentQueueItemFn = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z.object({
      id: z.string().uuid(),
      reason: z.string().trim().min(3, "Informe o motivo da rejeição.").max(500),
    }).strict().parse(data),
  )
  .handler(async ({ data }) => {
    const { rejectContentQueueItem } = await import("./ai-content-queue.server");
    return rejectContentQueueItem(data.id, data.reason);
  });

export const rejectContentQueueBatchFn = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z.object({
      batchId: z.string().uuid(),
      reason: z.string().trim().min(3).max(500).optional(),
    }).strict().parse(data),
  )
  .handler(async ({ data }) => {
    const { rejectContentQueueBatch } = await import("./ai-content-queue.server");
    return rejectContentQueueBatch(data.batchId, data.reason);
  });

export const getAiContentPerformanceFn = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { getAiContentPerformance } = await import("./ai-content-queue.server");
    return getAiContentPerformance();
  });
