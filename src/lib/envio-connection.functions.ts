import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { z } from "zod";

export const getEnvioConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async () => {
  const { getEnvioConnectionStatus: get } = await import("./envio-connection.server");
  return get();
});

export const saveEnvioCredentials = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ url: z.string().min(1), token: z.string().min(1), adminToken: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { saveEnvioCredentials: save } = await import("./envio-connection.server");
    await save(data);
    return { success: true as const };
  });

export const generateEnvioQrCode = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ phone: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { generateEnvioQrCode: gen } = await import("./envio-connection.server");
    return gen(data.phone);
  });

export const disconnectEnvio = createServerFn({ method: "POST" })
  .middleware([requireAppAuth]).handler(async () => {
  const { disconnectEnvio: disconnect } = await import("./envio-connection.server");
  await disconnect();
  return { success: true as const };
});

export const reclaimEnvioWebhook = createServerFn({ method: "POST" })
  .middleware([requireAppAuth]).handler(async () => {
  const { reclaimEnvioWebhook: reclaim } = await import("./envio-connection.server");
  await reclaim();
  return { success: true as const };
});
