import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";

export const getWhatsappCampaignAudienceOptions = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { listWhatsappCampaignAudienceOptions } = await import("./whatsapp-campaign-audience.server");
    return listWhatsappCampaignAudienceOptions();
  });
