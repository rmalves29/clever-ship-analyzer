import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { z } from "zod";

export const syncShopifyData = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ fullSync: z.boolean().optional().default(false) }).parse(data))
  .handler(async ({ data: { fullSync } }) => {
    const { runShopifySync } = await import("./crm-sync.server");
    return runShopifySync(fullSync);
  });
