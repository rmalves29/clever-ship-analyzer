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
