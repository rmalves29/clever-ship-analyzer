import { loadUazapiCreds, getInstanceStatus, connectInstance, disconnectInstance, setWebhook, type UazapiCreds } from "./envio-uazapi.server";

const APP_URL = "https://clever-ship-analyzer.lovable.app";
export const UAZAPI_WEBHOOK_PATH = "/api/uazapi-webhook";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type EnvioConnectionStatus = {
  configured: boolean;
  connected: boolean;
  connectedPhone: string | null;
  status: string;
};

export async function getEnvioConnectionStatus(): Promise<EnvioConnectionStatus> {
  const creds = await loadUazapiCreds();
  if (!creds) return { configured: false, connected: false, connectedPhone: null, status: "not_configured" };

  const { status, owner } = await getInstanceStatus(creds);
  const connected = status === "connected";

  const supabaseAdmin = await admin();
  await supabaseAdmin
    .from("store_settings" as any)
    .update({ uazapi_is_active: connected, uazapi_connected_phone: owner ?? null } as never)
    .neq("id", "");

  return { configured: true, connected, connectedPhone: owner ?? null, status };
}

export async function saveEnvioCredentials(input: { url: string; token: string; adminToken?: string | undefined }): Promise<void> {
  const supabaseAdmin = await admin();
  await supabaseAdmin
    .from("store_settings" as any)
    .update({
      uazapi_url: input.url.trim().replace(/\/$/, ""),
      uazapi_token: input.token.trim(),
      uazapi_admin_token: input.adminToken?.trim() || null,
    } as never)
    .neq("id", "");

  const creds: UazapiCreds = { url: input.url.trim().replace(/\/$/, ""), token: input.token.trim(), adminToken: input.adminToken?.trim() ?? null };
  await setWebhook(creds, `${APP_URL}${UAZAPI_WEBHOOK_PATH}`);
}

export async function generateEnvioQrCode(phone?: string): Promise<{ qrcode?: string; paircode?: string; status?: string }> {
  const creds = await loadUazapiCreds();
  if (!creds) throw new Error("UazAPI não configurada");
  return connectInstance(creds, phone);
}

export async function disconnectEnvio(): Promise<void> {
  const creds = await loadUazapiCreds();
  if (!creds) throw new Error("UazAPI não configurada");
  await disconnectInstance(creds);
  const supabaseAdmin = await admin();
  await supabaseAdmin.from("store_settings" as any).update({ uazapi_is_active: false } as never).neq("id", "");
}

/** Re-registra o webhook apontando pra este app — usado quando o usuário quer "reconectar por
 *  aqui" sem trocar URL/token (ex: reafirmar que o clever-ship-analyzer é quem recebe eventos). */
export async function reclaimEnvioWebhook(): Promise<void> {
  const creds = await loadUazapiCreds();
  if (!creds) throw new Error("UazAPI não configurada");
  await setWebhook(creds, `${APP_URL}${UAZAPI_WEBHOOK_PATH}`);
}
