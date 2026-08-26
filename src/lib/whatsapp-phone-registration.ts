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

/**
 * `code_verification_status` representa o desafio temporário de posse do número (SMS/voz).
 * Depois que o número já está registrado, esse desafio pode aparecer como EXPIRED sem tirar
 * o número da Cloud API. Por isso o estado operacional é determinado por:
 *   1. platform_type === CLOUD_API (número registrado na plataforma)
 *   2. webhook da WABA confirmado como inscrito
 *
 * O status do código continua sendo exibido para diagnóstico, mas só é bloqueante enquanto
 * o número ainda não entrou na Cloud API.
 */
export function deriveWhatsappPhoneReadiness(state: WhatsappPhoneGraphState): WhatsappPhoneReadiness {
  const codeVerified = String(state.codeVerificationStatus ?? "").toUpperCase() === "VERIFIED";
  const cloudApi = String(state.platformType ?? "").toUpperCase() === "CLOUD_API";
  const webhookReady = state.webhookSubscribed === true;
  const issues: string[] = [];

  if (!cloudApi && !codeVerified) {
    issues.push("A verificação de propriedade do número ainda não foi concluída na Meta.");
  }
  if (!cloudApi) {
    issues.push("O número ainda não aparece ativo na Cloud API; conclua o registro com o PIN de 6 dígitos.");
  }
  if (state.webhookSubscribed === false) {
    issues.push("O app ainda não está inscrito nos webhooks da WABA.");
  } else if (state.webhookSubscribed == null) {
    issues.push("Não foi possível confirmar a inscrição do webhook da WABA.");
  }

  return {
    codeVerified,
    cloudApi,
    webhookReady,
    ready: cloudApi && webhookReady,
    issues,
  };
}
