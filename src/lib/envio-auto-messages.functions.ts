import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { z } from "zod";

export const listEnvioAutoMessages = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async () => {
  const { listEnvioAutoMessages: list } = await import("./envio-auto-messages.server");
  return list();
});

const autoMessageSchema = z.object({
  group_id: z.string().uuid().nullable(),
  campaign_id: z.string().uuid().nullable(),
  event_type: z.enum(["join", "leave"]),
  content_type: z.enum(["text", "image"]),
  content_text: z.string().nullable(),
  media_url: z.string().nullable(),
  is_active: z.boolean(),
});

export const createEnvioAutoMessage = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => autoMessageSchema.parse(data))
  .handler(async ({ data }) => {
    const { createEnvioAutoMessage: create } = await import("./envio-auto-messages.server");
    return create(data);
  });

export const updateEnvioAutoMessage = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => autoMessageSchema.partial().extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { updateEnvioAutoMessage: update } = await import("./envio-auto-messages.server");
    const { id, ...patch } = data;
    return update(id, patch);
  });

export const deleteEnvioAutoMessage = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { deleteEnvioAutoMessage: del } = await import("./envio-auto-messages.server");
    return del(data.id);
  });

export const listEnvioReturnAutomations = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async () => {
  const { listEnvioReturnAutomations: list } = await import("./envio-auto-messages.server");
  return list();
});

const returnAutomationSchema = z.object({
  name: z.string().min(1),
  group_ids: z.array(z.string().uuid()),
  campaign_ids: z.array(z.string().uuid()),
  delay_minutes: z.number().int().min(0),
  invite_message: z.string().min(1),
  reward_message: z.string().min(1),
  coupon_code: z.string().min(1),
  validity_days: z.number().int().min(1),
  cooldown_hours: z.number().int().min(0),
  is_active: z.boolean(),
});

export const createEnvioReturnAutomation = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => returnAutomationSchema.parse(data))
  .handler(async ({ data }) => {
    const { createEnvioReturnAutomation: create } = await import("./envio-auto-messages.server");
    return create(data);
  });

export const updateEnvioReturnAutomation = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => returnAutomationSchema.partial().extend({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { updateEnvioReturnAutomation: update } = await import("./envio-auto-messages.server");
    const { id, ...patch } = data;
    return update(id, patch);
  });

export const deleteEnvioReturnAutomation = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { deleteEnvioReturnAutomation: del } = await import("./envio-auto-messages.server");
    return del(data.id);
  });

export const getEnvioReturnStats = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async () => {
  const { getEnvioReturnStats: get } = await import("./envio-auto-messages.server");
  return get();
});
