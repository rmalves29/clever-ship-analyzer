import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { z } from "zod";

const datePresetSchema = z.enum(["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month", "last_month"]);

/** Botão "Analisar e montar matriz": lê as publicações do Instagram e os anúncios do mesmo período,
 *  classifica cada peça com a IA e devolve a matriz já calculada. Nada é gravado no banco. */
export const generateCreativeMatrix = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ datePreset: datePresetSchema }).parse(data))
  .handler(async ({ data }) => {
    const { buildCreativeMatrix } = await import("./creative-matrix.server");
    return buildCreativeMatrix(data.datePreset);
  });

const cellSchema = z.object({
  n: z.number(),
  avgReach: z.number(),
  engagementRate: z.number().nullable(),
  avgSavesShares: z.number(),
});

const adCellSchema = z.object({
  n: z.number(),
  spend: z.number(),
  purchases: z.number(),
  roas: z.number().nullable(),
  lowData: z.boolean(),
});

const ideasInputSchema = z.object({
  datePreset: z.string().max(20),
  postsByAngle: z.record(z.string(), cellSchema),
  postsByFormat: z.record(z.string(), cellSchema),
  adsByAngle: z.record(z.string(), adCellSchema).nullable(),
  insights: z
    .array(z.object({ tone: z.enum(["positivo", "atencao", "critico"]), title: z.string().max(200), text: z.string().max(600) }))
    .max(20),
  topPosts: z
    .array(z.object({ caption: z.string().max(200), format: z.string().max(30), angle: z.string().max(40), engagementRate: z.number().nullable() }))
    .max(5),
  topAds: z
    .array(z.object({ name: z.string().max(150), angle: z.string().max(40), roas: z.number().nullable(), purchases: z.number() }))
    .max(5),
});

/** Botão "Gerar ideias": transforma a matriz já calculada em 5 posts e 3 anúncios para produzir. */
export const generateCreativeIdeas = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => ideasInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { buildCreativeIdeas } = await import("./creative-matrix.server");
    return buildCreativeIdeas(data);
  });
