import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";

const campaignSchema = z.object({ campaignId: z.string().uuid() });

export const getWhatsappQueueHealth = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { getWhatsappQueueHealthSnapshot } = await import("./whatsapp-queue-health.server");
    return getWhatsappQueueHealthSnapshot();
  });

export const pauseWhatsappCampaign = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => campaignSchema.parse(data))
  .handler(async ({ data }) => {
    const { pauseWhatsappCampaignQueue } = await import("./whatsapp-queue-health.server");
    return pauseWhatsappCampaignQueue(data.campaignId);
  });

export const resumeWhatsappCampaign = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => campaignSchema.parse(data))
  .handler(async ({ data }) => {
    const { resumeWhatsappCampaignQueue } = await import("./whatsapp-queue-health.server");
    return resumeWhatsappCampaignQueue(data.campaignId);
  });

export const retryFailedWhatsappCampaign = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => campaignSchema.parse(data))
  .handler(async ({ data }) => {
    const { retryFailedWhatsappCampaignQueue } = await import("./whatsapp-queue-health.server");
    return retryFailedWhatsappCampaignQueue(data.campaignId);
  });
