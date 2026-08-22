import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const listEnvioCampaigns = createServerFn({ method: "GET" }).handler(async () => {
  const { listEnvioCampaigns: list } = await import("./envio-campaigns.server");
  return list();
});

export const createEnvioCampaign = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ name: z.string().min(1), description: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { createEnvioCampaign: create } = await import("./envio-campaigns.server");
    return create(data);
  });

const groupTemplateSchema = z.object({
  name_base: z.string().optional(),
  description: z.string().optional(),
  image_url: z.string().optional(),
  max_participants: z.number().int().optional(),
  seed_numbers: z.array(z.string()).optional(),
});

export const updateEnvioCampaign = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().optional(),
        description: z.string().optional(),
        is_entry_open: z.boolean().optional(),
        is_active: z.boolean().optional(),
        facebook_pixel_id: z.string().optional(),
        auto_spawn_enabled: z.boolean().optional(),
        spawn_margin: z.number().int().optional(),
        group_template: groupTemplateSchema.optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { updateEnvioCampaign: update } = await import("./envio-campaigns.server");
    const { id, ...patch } = data;
    return update(id, patch as any);
  });

export const deleteEnvioCampaign = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { deleteEnvioCampaign: del } = await import("./envio-campaigns.server");
    return del(data.id);
  });

export const getCampaignGroupLinks = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ campaignId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { getCampaignGroupLinks: get } = await import("./envio-campaigns.server");
    return get(data.campaignId);
  });

export const setCampaignGroupLinks = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        campaignId: z.string().uuid(),
        links: z.array(z.object({ group_id: z.string().uuid(), weight_percent: z.number().nullable() })),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { setCampaignGroupLinks: set } = await import("./envio-campaigns.server");
    await set(data.campaignId, data.links);
    return { success: true as const };
  });

export const updateCampaignGroupWeight = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ campaignId: z.string().uuid(), groupId: z.string().uuid(), weightPercent: z.number().nullable() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { updateCampaignGroupWeight: update } = await import("./envio-campaigns.server");
    await update(data.campaignId, data.groupId, data.weightPercent);
    return { success: true as const };
  });

export const spawnGroupForCampaign = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ campaignId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { spawnGroupForCampaign: spawn } = await import("./envio-campaigns.server");
    return spawn(data.campaignId);
  });
