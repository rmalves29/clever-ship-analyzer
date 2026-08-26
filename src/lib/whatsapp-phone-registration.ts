export const META_GRAPH_API_VERSION = "v25.0";

export type WhatsappPhoneGraphState = {
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
  codeVerificationStatus?: string | null;
  qualityRating?: string | null;
  platformType?: string | null;
  nameStatus?: string | null;
  webhookSubscribed?: boolean | null;
};

export type WhatsappPhoneReadiness = {
  codeVerified: boolean;
  cloudApi: boolean;
  webhookReady: boolean;
  ready: boolean;
  issues: string[];
};

export function normalizeWhatsappRegistrationPin(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function isValidWhatsappRegistrationPin(value: string): boolean {
  return /^\d{6}$/.test(value);
}

export function deriveWhatsappPhoneReadiness(state: WhatsappPhoneGraphState): WhatsappPhoneReadiness {
  const codeVerified = String(state.codeVerificationStatus ?? "").toUpperCase() === "VERIFIED";
  const cloudApi = String(state.platformType ?? "").toUpperCase() === "CLOUD_API";
  const webhookReady = state.webhookSubscribed !== false;
  const issues: string[] = [];

  if (!codeVerified) issues.push("A verificação do número na Meta ainda não está concluída.");
  if (!cloudApi) issues.push("O número ainda não aparece ativo na Cloud API; conclua o registro com o PIN de 6 dígitos.");
  if (state.webhookSubscribed === false) issues.push("O app ainda não está inscrito nos webhooks da WABA.");

  return {
    codeVerified,
    cloudApi,
    webhookReady,
    ready: codeVerified && cloudApi && webhookReady,
    issues,
  };
}
