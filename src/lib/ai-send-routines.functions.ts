import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { z } from "zod";

export const generateAiRoutineDraftFn = createServerFn({ method: "POST" })
  .middleware([requireAppAuth]).handler(async () => {
  const { generateAiRoutineDraft } = await import("./ai-send-routines.server");
  return generateAiRoutineDraft();
});

const createSchema = z.object({
  campaignId: z.string().min(1),
  campaignName: z.string().min(1),
  contentText: z.string().min(1),
  contentImageUrl: z.string().nullable(),
  sourceSummary: z.string(),
  recurrence: z.enum(["once", "daily", "weekly", "monthly"]),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/),
  sendNow: z.boolean().optional(),
});

export const createAiSendRoutineFn = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data }) => {
    const { createAiSendRoutine } = await import("./ai-send-routines.server");
    return createAiSendRoutine(data);
  });
