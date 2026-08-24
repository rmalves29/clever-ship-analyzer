import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";

export const calculateRFMSegments = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { recalculateRFM } = await import("./crm-rfm.server");
    return recalculateRFM();
  });

export const getRFMStats = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { getRFMStatsData } = await import("./crm-rfm.server");
    return getRFMStatsData();
  });
