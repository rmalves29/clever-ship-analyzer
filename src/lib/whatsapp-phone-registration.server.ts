import {
  META_GRAPH_API_VERSION,
  deriveWhatsappPhoneReadiness,
  isValidWhatsappRegistrationPin,
} from "./whatsapp-phone-registration";

const GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

function graphError(payload: any, status: number): string {
  const error = payload?.error;
  const detail = error?.error_user_msg || error?.message || `Meta respondeu ${status}`;
  const code = error?.code ? ` (código ${error.code}${error?.error_subcode ? `/${error.error_subcode}` : ""})` : "";
  return `${detail}${code}`;
}

async function graphJson(url: string, accessToken: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function loadRegistrationSettings() {
  const { loadSettings } = await import("./whatsapp-meta.server");
  return loadSettings();
}

async function phoneBelongsToWaba(accessToken: string, wabaId: string, phoneNumberId: string) {
  const fields = "id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type";
  const { response, payload } = await graphJson(
    `${GRAPH_BASE}/${encodeURIComponent(wabaId)}/phone_numbers?fields=${encodeURIComponent(fields)}&limit=100`,
    accessToken,
  );
  if (!response.ok) return { success: false as const, error: graphError(payload, response.status) };
  const phones = Array.isArray(payload?.data) ? payload.data : [];
  const phone = phones.find((item: any) => String(item?.id ?? "") === phoneNumberId);
  if (!phone) {
    return {
      success: false as const,
      error: "O Phone Number ID recebido não pertence à WABA selecionada. Refaça o Cadastro Incorporado.",
    };
  }
  return { success: true as const, phone };
}

async function subscribeWaba(accessToken: string, wabaId: string) {
  const { response, payload } = await graphJson(
    `${GRAPH_BASE}/${encodeURIComponent(wabaId)}/subscribed_apps`,
    accessToken,
    { method: "POST" },
  );
  if (!response.ok || payload?.success !== true) {
    return { success: false as const, error: graphError(payload, response.status) };
  }
  return { success: true as const };
}

async function registerPhone(accessToken: string, phoneNumberId: string, pin: string) {
  if (!isValidWhatsappRegistrationPin(pin)) {
    return { success: false as const, error: "O PIN de registro precisa ter exatamente 6 números." };
  }
  const { response, payload } = await graphJson(
    `${GRAPH_BASE}/${encodeURIComponent(phoneNumberId)}/register`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", pin }),
    },
  );
  if (!response.ok || payload?.success !== true) {
    return { success: false as const, error: graphError(payload, response.status) };
  }
  return { success: true as const };
}

async function readPhoneGraphState(accessToken: string, phoneNumberId: string, wabaId: string, appId?: string | null) {
  const fields = "id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type";
  const phoneResult = await graphJson(
    `${GRAPH_BASE}/${encodeURIComponent(phoneNumberId)}?fields=${encodeURIComponent(fields)}`,
    accessToken,
  );
  if (!phoneResult.response.ok) {
    return { success: false as const, error: graphError(phoneResult.payload, phoneResult.response.status) };
  }

  let webhookSubscribed: boolean | null = null;
  const subscribed = await graphJson(`${GRAPH_BASE}/${encodeURIComponent(wabaId)}/subscribed_apps`, accessToken);
  if (subscribed.response.ok) {
    const apps = Array.isArray(subscribed.payload?.data) ? subscribed.payload.data : [];
    webhookSubscribed = appId ? apps.some((item: any) => String(item?.id ?? "") === appId) : apps.length > 0;
  }

  const graphState = {
    displayPhoneNumber: phoneResult.payload?.display_phone_number ?? null,
    verifiedName: phoneResult.payload?.verified_name ?? null,
    qualityRating: phoneResult.payload?.quality_rating ?? null,
    codeVerificationStatus: phoneResult.payload?.code_verification_status ?? null,
    platformType: phoneResult.payload?.platform_type ?? null,
    webhookSubscribed,
  };
  return {
    success: true as const,
    graphState,
    readiness: deriveWhatsappPhoneReadiness(graphState),
  };
}

async function persistEmbeddedCredentials(accessToken: string, phoneNumberId: string, wabaId: string, settingsId: string) {
  const db = await admin();
  const { error } = await db
    .from("store_settings")
    .update({
      whatsapp_meta_access_token: accessToken,
      whatsapp_meta_phone_number_id: phoneNumberId,
      whatsapp_meta_waba_id: wabaId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", settingsId);
  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

export async function getWhatsappPhoneRegistrationStatus() {
  const settings = await loadRegistrationSettings();
  if (!settings.accessToken || !settings.phoneNumberId || !settings.wabaId) {
    return {
      success: true as const,
      configured: false as const,
      apiVersion: META_GRAPH_API_VERSION,
      phoneNumberId: settings.phoneNumberId,
      wabaId: settings.wabaId,
      issues: ["Conecte uma conta do WhatsApp para consultar o estado do número."],
    };
  }

  const status = await readPhoneGraphState(settings.accessToken, settings.phoneNumberId, settings.wabaId, settings.appId);
  if (!status.success) {
    return {
      success: false as const,
      configured: true as const,
      apiVersion: META_GRAPH_API_VERSION,
      phoneNumberId: settings.phoneNumberId,
      wabaId: settings.wabaId,
      error: status.error,
    };
  }

  return {
    success: true as const,
    configured: true as const,
    apiVersion: META_GRAPH_API_VERSION,
    phoneNumberId: settings.phoneNumberId,
    wabaId: settings.wabaId,
    ...status.graphState,
    ...status.readiness,
  };
}

export async function registerCurrentWhatsappPhoneNumber(pin: string) {
  const settings = await loadRegistrationSettings();
  if (!settings.accessToken || !settings.phoneNumberId || !settings.wabaId) {
    return { success: false as const, error: "Conecte o WhatsApp antes de registrar o número." };
  }

  const before = await readPhoneGraphState(settings.accessToken, settings.phoneNumberId, settings.wabaId, settings.appId);
  if (before.success && before.readiness.cloudApi) {
    const subscription = await subscribeWaba(settings.accessToken, settings.wabaId);
    const status = await readPhoneGraphState(settings.accessToken, settings.phoneNumberId, settings.wabaId, settings.appId);
    return {
      success: true as const,
      alreadyRegistered: true as const,
      webhookSubscribed: subscription.success,
      warning: subscription.success ? undefined : subscription.error,
      status: status.success ? { ...status.graphState, ...status.readiness } : undefined,
    };
  }

  const registration = await registerPhone(settings.accessToken, settings.phoneNumberId, pin);
  if (!registration.success) return registration;

  const subscription = await subscribeWaba(settings.accessToken, settings.wabaId);
  const status = await readPhoneGraphState(settings.accessToken, settings.phoneNumberId, settings.wabaId, settings.appId);
  return {
    success: true as const,
    alreadyRegistered: false as const,
    webhookSubscribed: subscription.success,
    warning: subscription.success ? undefined : subscription.error,
    status: status.success ? { ...status.graphState, ...status.readiness } : undefined,
  };
}

export async function completeWhatsappEmbeddedSignup(params: {
  code: string;
  phoneNumberId: string;
  wabaId: string;
  pin: string;
}) {
  if (!isValidWhatsappRegistrationPin(params.pin)) {
    return { success: false as const, error: "Escolha um PIN de 6 números para concluir o registro do WhatsApp." };
  }

  const settings = await loadRegistrationSettings();
  if (!settings.appId || !settings.appSecret) {
    return { success: false as const, error: "Configure o App ID e o App Secret da Meta primeiro." };
  }
  if (!settings.id) {
    return { success: false as const, error: "Configure primeiro a conexão principal da loja em Configurações." };
  }

  const tokenUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", settings.appId);
  tokenUrl.searchParams.set("client_secret", settings.appSecret);
  tokenUrl.searchParams.set("code", params.code);

  const tokenResponse = await fetch(tokenUrl.toString());
  const tokenPayload: any = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenPayload?.access_token) {
    return { success: false as const, error: graphError(tokenPayload, tokenResponse.status) };
  }
  const accessToken = String(tokenPayload.access_token);

  const ownership = await phoneBelongsToWaba(accessToken, params.wabaId, params.phoneNumberId);
  if (!ownership.success) return ownership;

  // Persistimos o token antes do /register: se a Meta rejeitar o PIN, o usuário pode corrigir
  // o registro sem refazer todo o popup do Cadastro Incorporado.
  const persisted = await persistEmbeddedCredentials(accessToken, params.phoneNumberId, params.wabaId, settings.id);
  if (!persisted.success) return persisted;

  const registration = await registerPhone(accessToken, params.phoneNumberId, params.pin);
  if (!registration.success) {
    return {
      success: false as const,
      credentialsSaved: true as const,
      error: registration.error,
    };
  }

  const subscription = await subscribeWaba(accessToken, params.wabaId);
  const status = await readPhoneGraphState(accessToken, params.phoneNumberId, params.wabaId, settings.appId);

  return {
    success: true as const,
    registered: true as const,
    webhookSubscribed: subscription.success,
    warning: subscription.success ? undefined : `Número registrado, mas o webhook não foi inscrito: ${subscription.error}`,
    status: status.success ? { ...status.graphState, ...status.readiness } : undefined,
  };
}
