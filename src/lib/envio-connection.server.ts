import { loadUazapiCreds, getInstanceStatus, connectInstance, disconnectInstance, type UazapiCreds } from "./envio-uazapi.server";

/** O webhook desta instância pertence ao Cartzy (é ele que roda o motor de grupos, boas-vindas e retorno).
 *  Por isso nada aqui reaponta o webhook: salvar credenciais ou reconectar não mexe nele. */

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type EnvioConnectionStatus = {
  configured: boolean;
  connected: boolean;
  connectedPhone: string | null;
  status: string;
  instanceUrl: string | null;
};

/** Aceita só https com host válido; devolve a URL sem barra final. */
export function normalizeUazapiUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error("URL inválida. Use algo como https://sua-instancia.uazapi.com");
  }
  if (parsed.protocol !== "https:") throw new Error("A URL da instância precisa começar com https://");
  if (!parsed.hostname.includes(".")) throw new Error("URL inválida. Use algo como https://sua-instancia.uazapi.com");
  return parsed.origin;
}

export async function getEnvioConnectionStatus(): Promise<EnvioConnectionStatus> {
  const creds = await loadUazapiCreds();
  if (!creds) return { configured: false, connected: false, connectedPhone: null, status: "not_configured", instanceUrl: null };

  const { status, owner } = await getInstanceStatus(creds);
  const connected = status === "connected";
  const connectedPhone = owner ?? null;

  // A tela consulta a cada 5s: só grava no banco quando algo mudou.
  const supabaseAdmin = await admin();
  const { data: stored } = await supabaseAdmin.from("store_settings" as any).select("uazapi_is_active, uazapi_connected_phone").limit(1).maybeSingle();
  const row = stored as { uazapi_is_active: boolean | null; uazapi_connected_phone: string | null } | null;
  if (!row || row.uazapi_is_active !== connected || (row.uazapi_connected_phone ?? null) !== connectedPhone) {
    await supabaseAdmin
      .from("store_settings" as any)
      .update({ uazapi_is_active: connected, uazapi_connected_phone: connectedPhone } as never)
      .neq("id", "");
  }

  return { configured: true, connected, connectedPhone, status, instanceUrl: creds.url };
}

export async function saveEnvioCredentials(input: { url: string; token: string; adminToken?: string | undefined }): Promise<void> {
  const creds: UazapiCreds = { url: normalizeUazapiUrl(input.url), token: input.token.trim(), adminToken: input.adminToken?.trim() || null };
  // Testa antes de salvar: credencial errada não pode sobrescrever a que funciona.
  try {
    await getInstanceStatus(creds);
  } catch (e: any) {
    throw new Error(`Não consegui falar com a instância com esses dados: ${e?.message ?? "erro desconhecido"}`);
  }

  const supabaseAdmin = await admin();
  await supabaseAdmin
    .from("store_settings" as any)
    .update({ uazapi_url: creds.url, uazapi_token: creds.token, uazapi_admin_token: creds.adminToken } as never)
    .neq("id", "");
}

export async function generateEnvioQrCode(phone?: string): Promise<{ qrcode?: string; paircode?: string; status?: string }> {
  const creds = await loadUazapiCreds();
  if (!creds) throw new Error("UazAPI não configurada");
  return connectInstance(creds, phone?.replace(/\D/g, "") || undefined);
}

export async function disconnectEnvio(): Promise<void> {
  const creds = await loadUazapiCreds();
  if (!creds) throw new Error("UazAPI não configurada");
  await disconnectInstance(creds);
  const supabaseAdmin = await admin();
  await supabaseAdmin.from("store_settings" as any).update({ uazapi_is_active: false } as never).neq("id", "");
}
