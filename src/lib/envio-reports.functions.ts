import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { z } from "zod";

export const getEnvioReports = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ period: z.enum(["24h", "7d", "30d", "90d", "all"]) }).parse(data))
  .handler(async ({ data }) => {
    const { getEnvioReports: get } = await import("./envio-reports.server");
    return get(data.period);
  });
