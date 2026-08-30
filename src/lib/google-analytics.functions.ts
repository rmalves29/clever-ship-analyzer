import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data no formato AAAA-MM-DD.");
const rangeSchema = z
  .object({ startDate: isoDate, endDate: isoDate })
  .refine((value) => value.startDate <= value.endDate, {
    message: "A data inicial deve ser anterior à data final.",
    path: ["startDate"],
  });

export const getGa4Status = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { getGa4ConnectionStatus } =
      await import("./google-analytics.server");
    return getGa4ConnectionStatus();
  });

export const saveGa4Connection = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) =>
    z
      .object({
        propertyId: z.string().trim().min(1).max(64),
        serviceAccountJson: z.string().trim().min(20).max(100_000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { saveAndTestGa4Connection } =
      await import("./google-analytics.server");
    return saveAndTestGa4Connection(data.propertyId, data.serviceAccountJson);
  });

export const testGa4Connection = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { testSavedGa4Connection } =
      await import("./google-analytics.server");
    return testSavedGa4Connection();
  });

export const removeGa4Connection = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { disconnectGa4 } = await import("./google-analytics.server");
    return disconnectGa4();
  });

export const getGa4HistoricalReport = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((input: unknown) => rangeSchema.parse(input))
  .handler(async ({ data }) => {
    const { getGa4HistoricalDashboard } =
      await import("./google-analytics.server");
    return getGa4HistoricalDashboard(data);
  });

export const getGa4RealtimeReport = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .handler(async () => {
    const { getGa4RealtimeDashboard } =
      await import("./google-analytics.server");
    return getGa4RealtimeDashboard();
  });
