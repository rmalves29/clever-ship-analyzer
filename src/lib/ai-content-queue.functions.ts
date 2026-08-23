import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const generateAiContentBatchFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        campaignId: z.string().min(1),
        campaignName: z.string().min(1),
        mode: z.enum(["day", "week"]),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        timeOfDay: z.string().regex(/^\d{2}:\d{2}$/),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { generateAiContentBatch } = await import("./ai-content-queue.server");
    return generateAiContentBatch(data);
  });

export const listContentQueueBatchFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ batchId: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { listContentQueueBatch } = await import("./ai-content-queue.server");
    return listContentQueueBatch(data.batchId);
  });

export const updateContentQueueItemTextFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().min(1), contentText: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { updateContentQueueItemText } = await import("./ai-content-queue.server");
    return updateContentQueueItemText(data.id, data.contentText);
  });

export const approveContentQueueItemFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { approveContentQueueItem } = await import("./ai-content-queue.server");
    return approveContentQueueItem(data.id);
  });

export const approveContentQueueBatchFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ batchId: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { approveContentQueueBatch } = await import("./ai-content-queue.server");
    return approveContentQueueBatch(data.batchId);
  });

export const rejectContentQueueItemFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }) => {
    const { rejectContentQueueItem } = await import("./ai-content-queue.server");
    return rejectContentQueueItem(data.id);
  });

export const getAiContentPerformanceFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getAiContentPerformance } = await import("./ai-content-queue.server");
  return getAiContentPerformance();
});
