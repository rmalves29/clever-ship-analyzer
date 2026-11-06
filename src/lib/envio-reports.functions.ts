import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { z } from "zod";

export const getEnvioReports = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z
      .object({
        period: z.enum(["24h", "7d", "30d", "90d", "all"]),
        range: z
          .object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
          .refine((r) => r.from <= r.to, "A data inicial não pode ser depois da final.")
          .refine((r) => (new Date(`${r.to}T12:00:00Z`).getTime() - new Date(`${r.from}T12:00:00Z`).getTime()) / 86_400_000 <= 366, "Escolha no máximo 1 ano.")
          .nullish(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { getEnvioReports: get } = await import("./envio-reports.server");
    return get(data.period, data.range ?? null);
  });
