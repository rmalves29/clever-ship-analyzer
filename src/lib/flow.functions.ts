import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const listFlowAutomations = createServerFn({ method: "GET" }).handler(async () => {
  const { listFlowAutomations: list } = await import("./flow.server");
  return list();
});

export const getFlowAutomation = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { getFlowAutomation: get } = await import("./flow.server");
    return get(data.id);
  });

export const createFlowAutomation = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ name: z.string().max(120).optional() }).parse(data))
  .handler(async ({ data }) => {
    const { createFlowAutomation: create } = await import("./flow.server");
    return create(data.name);
  });

const nodeDataSchema = z.object({
  triggerKind: z.enum(["post_or_reel_comment", "story_reply", "live_comment", "dm_message"]).optional(),
  triggerKinds: z.array(z.enum(["post_or_reel_comment", "story_reply", "live_comment", "dm_message"])).optional(),
  keywords: z.array(z.string()).optional(),
  matchAny: z.boolean().optional(),
  text: z.string().max(2000).optional(),
  publicReply: z.string().max(500).optional(),
  imageUrl: z.string().max(500).optional().or(z.literal("")),
  audioUrl: z.string().max(500).optional().or(z.literal("")),
  videoUrl: z.string().max(500).optional().or(z.literal("")),
  buttonLabel: z.string().max(60).optional(),
  buttonUrl: z.string().max(500).optional().or(z.literal("")),
  delayMinutes: z.number().int().min(0).max(365 * 24 * 60).optional(),
  label: z.string().max(120).optional(),
  notes: z.string().max(4000).optional(),
  actionId: z.string().max(80).optional(),
  actionConfig: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  randomWeights: z.array(z.number().min(0).max(100)).max(10).optional(),
  randomEachTime: z.boolean().optional(),
  delayMode: z.enum(["duration", "date"]).optional(),
  delayAmount: z.number().min(0).max(365 * 24 * 60).optional(),
  delayUnit: z.enum(["minutes", "hours", "days"]).optional(),
  delayUseWindow: z.boolean().optional(),
  delayWindowStart: z.string().max(5).optional(),
  delayWindowEnd: z.string().max(5).optional(),
  delayDate: z.string().max(40).optional(),
});

const nodeKindEnum = z.enum([
  "trigger", "message", "messenger", "sms", "email", "channel",
  "ai_step", "action", "condition", "randomizer", "smart_delay", "start_automation", "delay",
]);

const canvasSchema = z.object({
  nodes: z.array(z.object({
    id: z.string(),
    type: nodeKindEnum,
    position: z.object({ x: z.number(), y: z.number() }),
    data: nodeDataSchema,
  })),
  edges: z.array(z.object({ id: z.string(), source: z.string(), target: z.string() })),
});

export const updateFlowAutomation = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().max(120).optional(),
      status: z.enum(["draft", "active", "paused"]).optional(),
      trigger_kind: z.enum(["post_or_reel_comment", "story_reply", "live_comment", "dm_message"]).optional(),
      trigger_kinds: z.array(z.enum(["post_or_reel_comment", "story_reply", "live_comment", "dm_message"])).optional(),
      keywords: z.array(z.string().max(60)).max(30).optional(),
      match_any_comment: z.boolean().optional(),
      media_id: z.string().max(200).nullable().optional(),
      canvas_data: canvasSchema.optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const { updateFlowAutomation: update } = await import("./flow.server");
    return update(data as any);
  });

export const deleteFlowAutomation = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { deleteFlowAutomation: del } = await import("./flow.server");
    return del(data.id);
  });

export const duplicateFlowAutomation = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { duplicateFlowAutomation: dup } = await import("./flow.server");
    return dup(data.id);
  });

export const listFlowContacts = createServerFn({ method: "GET" }).handler(async () => {
  const { listFlowContacts: list } = await import("./flow.server");
  return list();
});

export const listFlowLogs = createServerFn({ method: "GET" }).handler(async () => {
  const { listFlowLogs: list } = await import("./flow.server");
  return list();
});

export const addFlowContactTag = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ contactId: z.string().uuid(), tag: z.string().min(1).max(40) }).parse(data))
  .handler(async ({ data }) => {
    const { addFlowContactTag: add } = await import("./flow.server");
    return add(data.contactId, data.tag);
  });

export const removeFlowContactTag = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ contactId: z.string().uuid(), tag: z.string().min(1).max(40) }).parse(data))
  .handler(async ({ data }) => {
    const { removeFlowContactTag: remove } = await import("./flow.server");
    return remove(data.contactId, data.tag);
  });

export const uploadFlowImage = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ fileName: z.string().max(200), base64Data: z.string(), contentType: z.string().max(100) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { uploadFlowImage: upload } = await import("./flow.server");
    return upload(data);
  });

export const getFlowNodeStats = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ automationId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { getFlowNodeStats: get } = await import("./flow.server");
    return get(data.automationId);
  });
