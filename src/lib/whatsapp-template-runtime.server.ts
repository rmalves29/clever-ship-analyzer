import { META_GRAPH_API_VERSION } from "./whatsapp-phone-registration";
import { buildMetaWhatsappBodyParameters, extractWhatsappBodyVariables, type WhatsappTemplateComponent } from "./whatsapp-template-variables";

const GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;
const CACHE_TTL_MS = 5 * 60_000;

type CachedDefinition = {
  expiresAt: number;
  components: WhatsappTemplateComponent[];
};

const templateCache = new Map<string, CachedDefinition>();

function cacheKey(wabaId: string, name: string, language: string) {
  return `${wabaId}:${name}:${language}`;
}

async function loadTemplateComponents(params: {
  accessToken: string;
  wabaId: string;
  templateName: string;
  templateLanguage: string;
}): Promise<{ success: true; components: WhatsappTemplateComponent[] } | { success: false; error: string }> {
  const key = cacheKey(params.wabaId, params.templateName, params.templateLanguage);
  const cached = templateCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return { success: true, components: cached.components };

  const url = new URL(`${GRAPH_BASE}/${encodeURIComponent(params.wabaId)}/message_templates`);
  url.searchParams.set("name", params.templateName);
  url.searchParams.set("limit", "20");
  const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${params.accessToken}` } });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { success: false, error: payload?.error?.error_user_msg || payload?.error?.message || `Meta respondeu ${response.status}` };
  }

  const template = (payload?.data ?? []).find(
    (item: any) => item?.name === params.templateName && item?.language === params.templateLanguage,
  ) ?? (payload?.data ?? []).find((item: any) => item?.name === params.templateName);
  if (!template) return { success: false, error: `Template ${params.templateName} não encontrado na WABA configurada.` };

  const components = (template.components ?? []) as WhatsappTemplateComponent[];
  templateCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, components });
  return { success: true, components };
}

export async function sendWhatsappTemplateMessage(params: {
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
  to: string;
  templateName: string;
  templateLanguage: string;
  bodyParams: string[];
  mediaId?: string;
  mediaUrl?: string;
}) {
  const definition = await loadTemplateComponents(params);
  if (!definition.success) return { ok: false as const, error: definition.error };

  const variables = extractWhatsappBodyVariables(definition.components);
  if (variables.length !== params.bodyParams.length) {
    return {
      ok: false as const,
      error: `O template ${params.templateName} exige ${variables.length} variável(is), mas a mensagem recebeu ${params.bodyParams.length}.`,
    };
  }
  const missing = params.bodyParams.findIndex((value) => !String(value ?? "").trim());
  if (missing >= 0) {
    return { ok: false as const, error: `A variável ${variables[missing]?.label ?? missing + 1} está vazia.` };
  }

  const components: any[] = [];
  if (variables.length) {
    components.push({
      type: "body",
      parameters: buildMetaWhatsappBodyParameters(definition.components, params.bodyParams),
    });
  }

  const isUrl = (value: string) => /^https?:\/\//i.test(value);
  const isPlaceholder = (value: string) =>
    !value || value.includes("placeholder") || value.includes("default") || value.includes("undefined") || value.length < 10 || !value.includes(".");
  const hasValidMedia = Boolean(
    params.mediaId || (params.mediaUrl && isUrl(params.mediaUrl) && !isPlaceholder(params.mediaUrl)),
  );

  if (hasValidMedia) {
    const url = params.mediaUrl?.toLowerCase() || "";
    const mediaType = url.includes(".mp4") || url.includes("video") ? "video" : "image";
    components.push({
      type: "header",
      parameters: [{ type: mediaType, [mediaType]: params.mediaId ? { id: params.mediaId } : { link: params.mediaUrl } }],
    });
  }

  const response = await fetch(`${GRAPH_BASE}/${encodeURIComponent(params.phoneNumberId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${params.accessToken}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: params.to,
      type: "template",
      template: {
        name: params.templateName,
        language: { code: params.templateLanguage },
        ...(components.length ? { components } : {}),
      },
    }),
  });

  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false as const,
      error: payload?.error?.error_user_msg || payload?.error?.message || `Erro Meta: ${response.status}`,
    };
  }

  return { ok: true as const, waMessageId: payload?.messages?.[0]?.id as string | undefined };
}
