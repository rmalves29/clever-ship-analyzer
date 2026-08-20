import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const datePresetSchema = z.enum(["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month", "last_month"]);
const levelSchema = z.enum(["campaign", "adset", "ad"]);

export const getMetaAdsConnectionStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { getMetaAdsConnectionStatus: getStatus } = await import("./meta-ads.server");
  return getStatus();
});

export const getMetaAdsSummary = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ datePreset: datePresetSchema }).parse(data))
  .handler(async ({ data }) => {
    const { getMetaAdsSummary: getSummary } = await import("./meta-ads.server");
    return getSummary(data.datePreset);
  });

export const getMetaAdsRows = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ level: levelSchema, datePreset: datePresetSchema }).parse(data))
  .handler(async ({ data }) => {
    const { getMetaAdsRows: getRows } = await import("./meta-ads.server");
    return getRows(data.level, data.datePreset);
  });

export const getMetaAdsDayparting = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ datePreset: datePresetSchema }).parse(data))
  .handler(async ({ data }) => {
    const { getMetaAdsDayparting: getDayparting } = await import("./meta-ads.server");
    return getDayparting(data.datePreset);
  });

export const getMetaAdsPulse = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ datePreset: datePresetSchema }).parse(data))
  .handler(async ({ data }) => {
    const { getMetaAdsPulse: getPulse } = await import("./meta-ads.server");
    return getPulse(data.datePreset);
  });

export const listMetaAdsRules = createServerFn({ method: "GET" }).handler(async () => {
  const { listMetaAdsRules: list } = await import("./meta-ads.server");
  return list();
});

export const createMetaAdsRule = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ metric: z.enum(["cpa", "roas"]), operator: z.enum(["gt", "lt"]), value: z.number().positive() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { createMetaAdsRule: create } = await import("./meta-ads.server");
    return create(data);
  });

export const toggleMetaAdsRule = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid(), ativa: z.boolean() }).parse(data))
  .handler(async ({ data }) => {
    const { toggleMetaAdsRule: toggle } = await import("./meta-ads.server");
    return toggle(data.id, data.ativa);
  });

export const deleteMetaAdsRule = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { deleteMetaAdsRule: del } = await import("./meta-ads.server");
    return del(data.id);
  });

export const getMetaAdsCreatives = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ datePreset: datePresetSchema }).parse(data))
  .handler(async ({ data }) => {
    const { getMetaAdsCreatives: getCreatives } = await import("./meta-ads.server");
    return getCreatives(data.datePreset);
  });

export const setMetaAdsStatus = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().min(1), status: z.enum(["ACTIVE", "PAUSED"]) }).parse(data))
  .handler(async ({ data }) => {
    const { setMetaAdsStatus: setStatus } = await import("./meta-ads.server");
    return setStatus(data.id, data.status);
  });
