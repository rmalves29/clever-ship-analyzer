import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { z } from "zod";

const datePresetSchema = z.enum(["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month", "last_month"]);

export const getInstagramConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async () => {
  const { getInstagramConnectionStatus: getStatus } = await import("./instagram.server");
  return getStatus();
});

export const connectInstagram = createServerFn({ method: "POST" })
  .middleware([requireAppAuth]).handler(async () => {
  const { connectInstagram: connect } = await import("./instagram.server");
  return connect();
});

export const getInstagramOverview = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ datePreset: datePresetSchema }).parse(data))
  .handler(async ({ data }) => {
    const { getInstagramOverview: getOverview } = await import("./instagram.server");
    return getOverview(data.datePreset);
  });

export const getInstagramAudience = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async () => {
  const { getInstagramAudience: getAudience } = await import("./instagram.server");
  return getAudience();
});

export const getInstagramTopContent = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ datePreset: datePresetSchema }).parse(data))
  .handler(async ({ data }) => {
    const { getInstagramTopContent: getTopContent } = await import("./instagram.server");
    return getTopContent(data.datePreset);
  });
