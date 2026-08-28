import { GOALS, type SegmentType } from "./crm-mock";
import { buildBodyParameters } from "./whatsapp-template-body-tokens";

const DAY_MS = 86_400_000;
const ATTRIBUTION_WINDOW_DAYS = 3;

export type MessageType = "marketing" | "utility";

export type WhatsappSettings = {
  accessToken: string | null;
  phoneNumberId: string | null;
  templateName: string | null;
  templateLanguage: string;
  wabaId: string | null;
  verifyToken: string | null;
  costMarketing: number | null;
  costUtility: number | null;
  appId: string | null;
  appSecret: string | null;
  configId: string | null;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/**
 * Valida a assinatura `X-Hub-Signature-256` que a Meta envia no webhook do WhatsApp,
 * calculada com HMAC-SHA256 sobre o CORPO CRU usando o App Secret. Comparação em
 * tempo constante.
 *
 * Retorna:
 *  - `{ configured: false }` quando o App Secret ainda não está configurado
 *    (comportamento público atual é preservado, com aviso no log);
 *  - `{ configured: true, valid }` quando dá pra validar de fato.
 */
export async function verifyWhatsappWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): Promise<{ configured: boolean; valid: boolean }> {
  const { appSecret } = await loadSettings();
  if (!appSecret) return { configured: false, valid: false };
  if (!signatureHeader?.startsWith("sha256=")) return { configured: true, valid: false };

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const computed = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const provided = signatureHeader.slice("sha256=".length).trim().toLowerCase();
  if (computed.length !== provided.length) return { configured: true, valid: false };
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ provided.charCodeAt(i);
  return { configured: true, valid: diff === 0 };
}

export async function loadSettings(): Promise<WhatsappSettings & { id: string | null }> {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin
    .from("store_settings")
    .select(
      "id, whatsapp_meta_access_token, whatsapp_meta_phone_number_id, whatsapp_meta_template_name, whatsapp_meta_template_language, whatsapp_meta_waba_id, whatsapp_meta_verify_token, whatsapp_cost_marketing, whatsapp_cost_utility, whatsapp_meta_app_id, whatsapp_meta_app_secret, whatsapp_meta_config_id",
    )
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    id: data?.id ?? null,
    accessToken: data?.whatsapp_meta_access_token ?? null,
    phoneNumberId: data?.whatsapp_meta_phone_number_id ?? null,
    templateName: data?.whatsapp_meta_template_name ?? null,
    templateLanguage: data?.whatsapp_meta_template_language ?? "pt_BR",
    wabaId: data?.whatsapp_meta_waba_id ?? null,
    verifyToken: data?.whatsapp_meta_verify_token ?? null,
    costMarketing: data?.whatsapp_cost_marketing ?? null,
    costUtility: data?.whatsapp_cost_utility ?? null,
    appId: data?.whatsapp_meta_app_id ?? null,
    appSecret: data?.whatsapp_meta_app_secret ?? null,
    configId: data?.whatsapp_meta_config_id ?? null,
  };
}

/** Troca o "code" do Embedded Signup por um token de acesso e salva tudo automaticamente. */
export async function exchangeEmbeddedSignupCode(params: { code: string; phoneNumberId: string; wabaId: string }) {
  const settings = await loadSettings();
  if (!settings.appId || !settings.appSecret) {
    return { success: false as const, error: "Configure o App ID e o App Secret da Meta em Configurações primeiro." };
  }
  if (!settings.id) {
    return { success: false as const, error: "Configure primeiro a conexão com o Shopify em Configurações." };
  }

  const tokenUrl = new URL("https://graph.facebook.com/v20.0/oauth/access_token");
  tokenUrl.searchParams.set("client_id", settings.appId);
  tokenUrl.searchParams.set("client_secret", settings.appSecret);
  tokenUrl.searchParams.set("code", params.code);

  const res = await fetch(tokenUrl.toString());
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json?.access_token) {
    return { success: false as const, error: json?.error?.message ?? "Falha ao trocar o código pelo token de acesso." };
  }

  const accessToken = json.access_token as string;

  // Inscreve o app pra receber os webhooks dessa WABA (status de entrega/leitura).
  try {
    await fetch(`https://graph.facebook.com/v20.0/${params.wabaId}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // Não crítico — o usuário ainda pode reenviar/re-inscrever depois.
  }

  const supabaseAdmin = await admin();
  const { error } = await supabaseAdmin
    .from("store_settings")
    .update({
      whatsapp_meta_access_token: accessToken,
      whatsapp_meta_phone_number_id: params.phoneNumberId,
      whatsapp_meta_waba_id: params.wabaId,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", settings.id);

  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

/** Converte telefone para E.164, garantindo DDI 55 para números BR se necessário. */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  
  // Se já tem +, assumimos que está correto e apenas limpamos caracteres não-numéricos
  if (raw.trim().startsWith("+")) return `+${digits}`;
  
  // Se começa com 55 e tem tamanho de DDI + DDD + Número (12 ou 13 dígitos)
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }
  
  // Se tem 10 ou 11 dígitos (DDD + Número), adicionamos o DDI 55 do Brasil
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }
  
  // Fallback: retorna com + se tiver comprimento mínimo razoável, senão null
  return digits.length >= 8 ? `+${digits}` : null;
}

/** IDs de clientes que batem com o segmento — calculado sobre o histórico completo, não o período do dashboard. */
export async function getSegmentCustomerIds(segmentType: SegmentType | string, segmentId?: string): Promise<string[]> {
  const supabaseAdmin = await admin();

  // Prioridade para o segmentId se fornecido, ou se segmentType parecer um UUID
  const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
  const finalSegmentType = segmentId || segmentType;
  const isCustomSegment = isUuid(finalSegmentType);

  // NOVO: Segmento de Carrinho Abandonado (Individual)
  if (finalSegmentType === "carrinho" || finalSegmentType === "abandoned_cart") {
    const { data: abandonedCheckouts } = await supabaseAdmin
      .from("shopify_abandoned_checkouts")
      .select("customer_id");
    
    const ids = new Set<string>();
    abandonedCheckouts?.forEach(ac => {
      if (ac.customer_id) ids.add(ac.customer_id);
    });
    return Array.from(ids);
  }

  if (finalSegmentType === "envio_atrasado") {
    const cutoff = new Date(Date.now() - 30 * DAY_MS).toISOString();
    const { data: fulfillments } = await supabaseAdmin
      .from("shopify_fulfillments")
      .select("updated_at, shopify_orders!inner(customer_id, processed_at)")
      .not("tracking_number", "is", null)
      .gte("updated_at", cutoff);

    const ids = new Set<string>();
    for (const f of fulfillments ?? []) {
      const order = f.shopify_orders as unknown as { customer_id: string | null; processed_at: string | null } | null;
      if (!order?.customer_id || !order?.processed_at || !f.updated_at) continue;
      const hours = (new Date(f.updated_at).getTime() - new Date(order.processed_at).getTime()) / 3_600_000;
      if (hours / 24 > GOALS.tempoMedioEnvio.regular) ids.add(order.customer_id);
    }
    return Array.from(ids);
  }

  const { data: orders } = await supabaseAdmin
    .from("shopify_orders")
    .select("customer_id, total_price, processed_at, created_at")
    .neq("financial_status", "VOIDED")
    .neq("financial_status", "REFUNDED");

  const byCustomer = new Map<string, { dates: number[]; total: number }>();
  for (const o of orders ?? []) {
    if (!o.customer_id) continue;
    const at = new Date(o.processed_at ?? o.created_at).getTime();
    const agg = byCustomer.get(o.customer_id) ?? { dates: [], total: 0 };
    agg.dates.push(at);
    agg.total += Number(o.total_price ?? 0);
    byCustomer.set(o.customer_id, agg);
  }

  const now = Date.now();
  const ids: string[] = [];
  for (const [customerId, agg] of byCustomer) {
    const count = agg.dates.length;
    const avgTicket = agg.total / count;
    
    let match = false;
    if (!isCustomSegment) {
      if (finalSegmentType === "ticket_alto") match = avgTicket > GOALS.ticketMedio.regular;
      else if (finalSegmentType === "sem_recompra") match = count === 1; 
      else if (finalSegmentType === "recorrencia") match = count > 1;
      else if (finalSegmentType === "recompra_30d") match = count >= 1;
      else if (finalSegmentType === "recompra_60d") match = count >= 1;
      else if (finalSegmentType === "envio_atrasado") match = true;

      if (match) ids.push(customerId);
    }
  }

  if (ids.length > 0 || !isCustomSegment) return ids;

  const { data: customSegment } = await supabaseAdmin
    .from("crm_segments")
    .select("id, regras")
    .eq("id", finalSegmentType)
    .maybeSingle();

  if (customSegment) {
    const { data: staticMembers } = await supabaseAdmin
      .from("crm_list_members")
      .select("customer_id")
      .eq("lista_id", finalSegmentType);
    
    if (staticMembers?.length) return staticMembers.map(m => m.customer_id);

    const { data: allCustomers } = await supabaseAdmin
      .from("shopify_customers")
      .select("id, email, city, province, phone, tags, tags_custom");

    if (allCustomers && (customSegment.regras as any)?.groups) {
      const groups = (customSegment.regras as any).groups;
      const customerIdsWithOrders = new Set((orders ?? []).map((o) => o.customer_id).filter(Boolean));

      // Mapear regras para ids
      const filtered = allCustomers.filter(c => {
        return groups.some((g: any) => {
          if (!g.conditions?.length) return false;
          return g.conditions.every((cond: any) => {
            const field = cond.field;
            const operator = cond.operator;
            const value = cond.value;
            const target = String(value || "").toLowerCase();

            if (field === "tags_custom") {
              const tagsCustom = ((c as any).tags_custom ?? []) as string[];
              if (operator === "contains") return tagsCustom.includes(value);
              if (operator === "not_contains") return !tagsCustom.includes(value);
              if (operator === "eq") return tagsCustom.length === 1 && tagsCustom[0] === value;
              return false;
            }

            if (field === "customer_tag") {
              const tags = ((c as any).tags ?? []) as string[];
              if (operator === "contains") return tags.includes(value);
              if (operator === "not_contains") return !tags.includes(value);
              if (operator === "eq") return tags.length === 1 && tags[0] === value;
              return false;
            }

            if (field === "checkout_abandonado") {
              const tags = ((c as any).tags ?? []) as string[];
              const isMatch = tags.includes("Carrinho Abandonado") || tags.includes("Checkout") || tags.includes("CAR24");
              return value === "sim" ? (operator === "eq" ? isMatch : !isMatch) : true;
            }

            if (field === "data_pedido_hoje" || field === "data_pedido_24h" || field === "data_envio_hoje") {
              // Estes campos dependem de subqueries complexas. No filter client-side, 
              // vamos assumir falso para evitar processamento pesado aqui.
              return false;
            }


            if (field === "total_pedidos" || field === "recorrencia") {
              const numVal = Number(value);
              const orderCount = orders?.filter(o => o.customer_id === c.id).length || 0;

              if (field === "total_pedidos") {
                if (operator === "eq") return orderCount === numVal;
                if (operator === "gt") return orderCount > numVal;
                if (operator === "gte") return orderCount >= numVal;
                if (operator === "lt") return orderCount < numVal;
                if (operator === "lte") return orderCount <= numVal;
              }
              if (field === "recorrencia") {
                const isRecurring = orderCount > 1;
                return operator === "eq" ? isRecurring === (target === "true" || target === "1") : true;
              }
            }

            // "perfil" não é uma coluna de shopify_customers — replica a mesma lógica usada em
            // crm-segmentation.functions.ts (editor de segmentos) pros valores conhecidos, senão
            // esse filtro sempre bate vazio (c["perfil"] é sempre undefined).
            if (field === "perfil") {
              const hasOrders = customerIdsWithOrders.has(c.id);
              const tags = ((c as any).tags ?? []) as string[];
              const hasExcludedTag = tags.includes("Carrinho Abandonado") || tags.includes("Checkout") || tags.includes("CAR24");

              if (value === "acesso_sem_compra" || value === "lead") {
                const isMatch = !hasOrders && !hasExcludedTag;
                return operator === "eq" ? isMatch : !isMatch;
              }
              if (value === "primeira_compra") {
                const orderCount = orders?.filter(o => o.customer_id === c.id).length || 0;
                const isMatch = orderCount === 1;
                return operator === "eq" ? isMatch : !isMatch;
              }
              if (value === "carrinho") {
                // Já coberto pelo branch dedicado "carrinho"/"abandoned_cart" acima; mantido aqui
                // só pra combinações de segmento que decidam checar via crm_segments mesmo assim.
                return operator === "eq" ? hasExcludedTag : !hasExcludedTag;
              }
              return false;
            }

            const val = String(c[field as keyof typeof c] || "").toLowerCase();
            if (operator === "eq") return val === target;
            if (operator === "neq") return val !== target;
            if (operator === "contains") return val.includes(target);
            if (operator === "starts_with") return val.startsWith(target);
            return false;
          });
        });
      });

      return filtered.map(c => c.id);
    }
  }

  return ids;
}

export async function getCustomersWithPhone(ids: string[]) {
  if (ids.length === 0) return [];
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin.from("shopify_customers").select("id, phone, first_name").in("id", ids);
  return (data ?? []).filter((c) => Boolean(c.phone)) as { id: string; phone: string; first_name: string | null }[];
}

export async function countSegmentRecipients(segmentType: SegmentType | string, segmentId?: string) {
  const ids = await getSegmentCustomerIds(segmentType, segmentId);
  const customers = await getCustomersWithPhone(ids);
  
  // Validar se o telefone convertido para E164 é válido para o WhatsApp
  const validos = customers.filter((c) => {
    const e164 = toE164(c.phone);
    return e164 && e164.length >= 12; // Mínimo +55 + DDD + 8 dígitos
  });
  
  return { 
    clientes: ids.length, 
    comTelefone: customers.length, 
    destinatarios: validos.length 
  };
}

/** Chamada crua à Meta. Uso restrito ao worker da fila (`whatsapp-queue.server.ts`).
 *  Não chame direto em fluxos de campanha — tudo passa pela queue. */
export async function sendTemplateMessage(params: {
  accessToken: string;
  phoneNumberId: string;
  to: string;
  templateName: string;
  templateLanguage: string;
  bodyParams: string[];
  bodyParamTokens?: string[];
  mediaId?: string;
  mediaUrl?: string;
}) {
  const components: any[] = [];

  if (params.bodyParams.length) {
    components.push({
      type: "body",
      parameters: buildBodyParameters(params.bodyParams, params.bodyParamTokens),
    });
  }

  // Validação disruptiva de mídia: só inclui header se tiver ID ou URL absoluta válida (não placeholder)
  // Ignora explicitamente strings que parecem ser placeholders ou caminhos relativos
  const isUrl = (s: string) => /^https?:\/\//i.test(s);
  const isPlaceholder = (s: string) => 
    !s || 
    s.includes("placeholder") || 
    s.includes("default") || 
    s.includes("undefined") ||
    s.length < 10 || 
    !s.includes(".");

  const hasValidMedia = Boolean(
    params.mediaId || 
    (params.mediaUrl && isUrl(params.mediaUrl) && !isPlaceholder(params.mediaUrl))
  );

  if (hasValidMedia) {
    const url = params.mediaUrl?.toLowerCase() || "";
    const isVideo = url.includes(".mp4") || url.includes("video");
    const mediaType = isVideo ? "video" : "image";

    components.push({
      type: "header",
      parameters: [
        {
          type: mediaType,
          [mediaType]: params.mediaId ? { id: params.mediaId } : { link: params.mediaUrl },
        },
      ],
    });
  }

  const res = await fetch(`https://graph.facebook.com/v20.0/${params.phoneNumberId}/messages`, {
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

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`[sendTemplateMessage] Falha na API da Meta (To: ${params.to}, Template: ${params.templateName}):`, { status: res.status, body: json });
    return { ok: false as const, error: json?.error?.error_user_msg || json?.error?.message || `Erro Meta: ${res.status}` };
  }
  const waMessageId: string | undefined = json?.messages?.[0]?.id;
  console.log("[sendTemplateMessage] Success", { waMessageId, to: params.to });
  return { ok: true as const, waMessageId };
}

export async function listMetaTemplates() {

  const settings = await loadSettings();
  if (!settings.accessToken || !settings.wabaId) {
    console.log("[listMetaTemplates] Missing credentials", { wabaId: settings.wabaId, hasToken: !!settings.accessToken });
    return { success: false as const, error: "Configure o token de acesso e o WABA ID em Configurações.", templates: [] };
  }

  const res = await fetch(`https://graph.facebook.com/v20.0/${settings.wabaId}/message_templates?limit=100`, {
    headers: { Authorization: `Bearer ${settings.accessToken}` },
  });
  
  const json: any = await res.json().catch(() => ({}));
  console.log("[listMetaTemplates] API Response", { status: res.status, count: json?.data?.length, wabaId: settings.wabaId });

  if (!res.ok) {
    return { success: false as const, error: json?.error?.message ?? `Meta respondeu ${res.status}`, templates: [] };
  }

  const templates = (json.data ?? []).map((t: any) => ({
    id: t.id as string,
    name: t.name as string,
    status: t.status as string,
    category: t.category as string,
    language: t.language as string,
    components: (t.components ?? []) as { type: string; text?: string; format?: string }[],
  }));
  return { success: true as const, templates };
}

export type NewCampaignInput = {
  nome: string;
  segmentType: string;
  segmentId?: string | undefined;
  messageType: MessageType;
  templateName?: string | undefined;
  templateLanguage?: string | undefined;
  bodyParams: string[];
  bodyParamTokens?: string[] | undefined;
  couponCode?: string | undefined;
  origem?: string | undefined;
  automationId?: string | undefined;
  /** Chave de reaproveitamento: disparos sucessivos da mesma etapa de automação somam
   *  na mesma campanha em vez de criar uma nova a cada execução do tick. */
  automationStepId?: string | undefined;
  campaignTag?: string | undefined;
  /** Usado por lotes de automação, onde o tamanho real do lote já é conhecido — evita recalcular o segmento inteiro. */
  totalDestinatariosOverride?: number | undefined;
};

/** Cria a campanha no banco (sem enviar). Status inicial define se vai pra fila de aprovação. */
export async function createCampaignRow(input: NewCampaignInput, status: "aguardando_aprovacao" | "enviando" | "agendada") {
  const supabaseAdmin = await admin();
  const settings = await loadSettings();

  const templateName = input.templateName?.trim() || settings.templateName;
  const segmentId = input.segmentId;

  if (!settings.accessToken || !settings.phoneNumberId || !templateName) {
    return {
      success: false as const,
      error: "Configure o token de acesso, o Phone Number ID e o template do WhatsApp (Meta) em Configurações.",
    };
  }

  const destinatarios =
    input.totalDestinatariosOverride ?? (await countSegmentRecipients(input.segmentType, segmentId)).destinatarios;

  const { data: campaign, error } = await supabaseAdmin
    .from("whatsapp_campaigns")
    .insert({
      nome: input.nome,
      status,
      segment_type: input.segmentType,
      segment_id: segmentId || null,
      template_name: templateName,
      template_language: input.templateLanguage?.trim() || settings.templateLanguage,
      message_type: input.messageType,
      body_params: input.bodyParams,
      body_param_tokens: input.bodyParamTokens ?? null,
      coupon_code: input.couponCode?.trim() || null,
      origem: input.origem ?? "crm",
      automation_id: input.automationId ?? null,
      automation_step_id: input.automationStepId ?? null,
      total_destinatarios: destinatarios,
      campaign_tag: input.campaignTag || null,
    } as any)
    .select("id")
    .single();

  if (error || !campaign) return { success: false as const, error: error?.message ?? "Falha ao criar a campanha." };
  return { success: true as const, campaignId: (campaign as { id: string }).id, destinatarios };
}

/** Campanha já existente pra essa etapa de automação (a mais antiga, se houver mais de uma
 *  de execuções antes desse reaproveitamento existir) — usada pra somar disparos sucessivos
 *  do tick na mesma campanha em vez de criar uma nova a cada execução. */
export async function findAutomationStepCampaignId(automationId: string, automationStepId: string): Promise<string | null> {
  const supabaseAdmin = await admin();
  const { data } = await (supabaseAdmin.from("whatsapp_campaigns") as any)
    .select("id")
    .eq("automation_id", automationId)
    .eq("automation_step_id", automationStepId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/** Só pra automações com aprovação: acha a campanha dessa etapa (se já existir, seja qual for o
 *  status) pra unificar SEMPRE num único registro, igual ao envio direto. Se a campanha já tinha
 *  sido decidida (aprovada/rejeitada/enviada), o lote novo, ainda não revisado, precisa fazer ela
 *  voltar pra "aguardando_aprovacao" — quem chama decide isso a partir do status retornado aqui. */
export async function findPendingApprovalCampaignId(automationId: string, automationStepId: string): Promise<{ id: string; totalDestinatarios: number; status: string } | null> {
  const supabaseAdmin = await admin();
  const { data } = await (supabaseAdmin.from("whatsapp_campaigns") as any)
    .select("id, total_destinatarios, status")
    .eq("automation_id", automationId)
    .eq("automation_step_id", automationStepId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id as string, totalDestinatarios: Number(data.total_destinatarios ?? 0), status: data.status as string };
}

/** Resolve os destinatários reais de um segmento — inclui a lógica especial de Carrinho Abandonado
 *  (que puxa de `shopify_abandoned_checkouts`, não de `shopify_customers`). Reaproveitado por
 *  `dispatchCampaign` e pelo motor de automação (`automations-engine.server.ts`). */
export async function resolveSegmentRecipients(segmentType: string, ids: string[]) {
  const supabaseAdmin = await admin();
  const isAbandonedCartSegment = segmentType === "carrinho" || segmentType === "abandoned_cart";

  if (isAbandonedCartSegment) {
    const { data: abandonedEvents } = await (supabaseAdmin
      .from("shopify_abandoned_checkouts")
      .select("customer_id, phone, checkout_url, shopify_customers(first_name)") as any)
      .in("customer_id", ids);

    return (abandonedEvents ?? [])
      .map((ae: any) => ({
        id: ae.customer_id as string,
        phone: ae.phone as string,
        first_name: (ae.shopify_customers?.first_name ?? null) as string | null,
        checkout_url: ae.checkout_url as string | null,
      }))
      .filter((r: { phone: string }) => Boolean(r.phone));
  }

  return getCustomersWithPhone(ids);
}

/** Enfileira a campanha já criada. NÃO envia nada direto — o envio real é feito pelo worker
 *  (`processWhatsappQueueBatch` em `whatsapp-queue.server.ts`).
 *  `restrictToCustomerIds`, quando informado, pula o recálculo do segmento inteiro e enfileira só
 *  pra essa lista — usado pelo motor de automação pra não reenviar pra quem já recebeu antes. */
export async function dispatchCampaign(campaignId: string, restrictToCustomerIds?: string[]) {
  const { enqueueCampaign } = await import("./whatsapp-queue.server");
  const result = await enqueueCampaign(campaignId, restrictToCustomerIds);
  if (!result.success) return result;

  return {
    success: true as const,
    campaignId,
    total: result.total,
    queued: result.queued,
    skipped: result.skipped,
    // Envio é assíncrono: os contadores reais são preenchidos pelo worker via refreshCampaignStatus.
    sent: 0,
    failed: 0,
    sampleErrors: [] as string[],
  };
}


const RANK: Record<string, number> = { sent: 0, delivered: 1, read: 2, failed: 3 };

/** Chamado pelo webhook da Meta (ver src/server.ts) — atualiza status de entrega/leitura. */
export async function applyMetaStatusUpdate(status: {
  id: string;
  status: string;
  timestamp?: string;
  errors?: { code?: number; title?: string; message?: string }[];
}): Promise<void> {
  const supabaseAdmin = await admin();
  const { data: recipient } = await supabaseAdmin
    .from("whatsapp_campaign_recipients")
    .select("id, status")
    .eq("wa_message_id", status.id)
    .maybeSingle();
  if (!recipient) return;

  const current = (recipient as { id: string; status: string }).status;
  if (status.status !== "failed" && (RANK[status.status] ?? -1) <= (RANK[current] ?? -1)) return;

  const at = status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString();
  const patch: Record<string, unknown> = { status: status.status };
  if (status.status === "delivered") patch["delivered_at"] = at;
  if (status.status === "read") patch["read_at"] = at;
  if (status.status === "failed" && status.errors?.[0]) {
    const e = status.errors[0];
    patch["error"] = [e.code, e.title ?? e.message].filter(Boolean).join(" — ");
  }

  await supabaseAdmin
    .from("whatsapp_campaign_recipients")
    .update(patch as never)
    .eq("id", (recipient as { id: string }).id);
}

/** Verify token guardado — usado pelo handshake GET do webhook em src/server.ts. */
export async function getStoredVerifyToken(): Promise<string | null> {
  const settings = await loadSettings();
  return settings.verifyToken;
}

export type TemplateComponentInput =
  | { type: "HEADER"; format: "TEXT"; text: string }
  | { type: "BODY"; text: string }
  | { type: "FOOTER"; text: string }
  | { type: "BUTTONS"; buttons: { type: "QUICK_REPLY"; text: string }[] };

/** Cria um template novo no WABA e manda pra fila de revisão da Meta (fica "PENDING" até ela decidir). */
export async function createTemplate(input: {
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  components: TemplateComponentInput[];
}) {
  const settings = await loadSettings();
  if (!settings.accessToken || !settings.wabaId) {
    return { success: false as const, error: "Configure o token de acesso e o WABA ID em Configurações." };
  }

  const name = input.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (!name) return { success: false as const, error: "Nome inválido." };

  const res = await fetch(`https://graph.facebook.com/v20.0/${settings.wabaId}/message_templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.accessToken}` },
    body: JSON.stringify({ name, category: input.category, language: input.language, components: input.components }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[createTemplate] Error", { status: res.status, body: json });
    return { success: false as const, error: json?.error?.error_user_msg ?? json?.error?.message ?? `Meta respondeu ${res.status}` };
  }

  const supabaseAdmin = await admin();
  await supabaseAdmin.from("whatsapp_template_events").insert({
    template_id: json.id ?? null,
    template_name: name,
    template_language: input.language,
    category: input.category,
    event: json.status ?? "PENDING",
    reason: null,
  } as never);

  return { success: true as const, id: json.id as string | undefined, name, status: (json.status as string) ?? "PENDING" };
}

/** Grava o evento de aprovação/rejeição vindo do webhook `message_template_status_update` da Meta —
 *  a lista de templates em si sempre vem ao vivo da Meta (listMetaTemplates), isso aqui é só o
 *  histórico/feed pra avisar que algo mudou, sem precisar o usuário ficar clicando "Atualizar". */
export async function applyMetaTemplateStatusUpdate(event: {
  templateId?: string | undefined;
  name: string;
  language?: string | undefined;
  category?: string | undefined;
  event: string;
  reason?: string | null | undefined;
}): Promise<void> {
  const supabaseAdmin = await admin();
  await supabaseAdmin.from("whatsapp_template_events").insert({
    template_id: event.templateId ?? null,
    template_name: event.name,
    template_language: event.language ?? null,
    category: event.category ?? null,
    event: event.event,
    reason: event.reason ?? null,
  } as never);
}

/** Últimos eventos de aprovação/rejeição — feed que a aba Templates mostra pro usuário. */
export async function getRecentTemplateEvents(limit = 20) {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin
    .from("whatsapp_template_events")
    .select("id, template_name, template_language, event, reason, received_at")
    .order("received_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as { id: string; template_name: string; template_language: string | null; event: string; reason: string | null; received_at: string }[];
}

/** Registra (ou reforça) a inscrição do App no campo `message_template_status_update` do webhook,
 *  sem derrubar os campos já inscritos (ex: `messages`, usado por status de entrega/leitura) —
 *  a Meta substitui a lista inteira de campos a cada POST, então primeiro lê o que já tem. */
export async function ensureTemplateStatusWebhookSubscribed() {
  const settings = await loadSettings();
  if (!settings.appId || !settings.appSecret) {
    return { success: false as const, error: "Configure o App ID e o App Secret da Meta em Configurações." };
  }
  const appToken = `${settings.appId}|${settings.appSecret}`;
  const callbackUrl = "https://clever-ship-analyzer.lovable.app/api/whatsapp-webhook";
  const verifyToken = settings.verifyToken;
  if (!verifyToken) return { success: false as const, error: "Configure o Verify Token em Configurações." };

  const currentRes = await fetch(
    `https://graph.facebook.com/v20.0/${settings.appId}/subscriptions?access_token=${encodeURIComponent(appToken)}`,
  );
  const currentJson: any = await currentRes.json().catch(() => ({}));
  const wabaSub = (currentJson.data ?? []).find((s: any) => s.object === "whatsapp_business_account");
  const existingFields: string[] = (wabaSub?.fields ?? []).map((f: any) => f.name);
  const fields = Array.from(new Set([...existingFields, "messages", "message_template_status_update"]));

  const params = new URLSearchParams({
    object: "whatsapp_business_account",
    callback_url: callbackUrl,
    verify_token: verifyToken,
    fields: fields.join(","),
    access_token: appToken,
  });
  const res = await fetch(`https://graph.facebook.com/v20.0/${settings.appId}/subscriptions`, {
    method: "POST",
    body: params,
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || !json?.success) {
    return { success: false as const, error: json?.error?.message ?? `Meta respondeu ${res.status}` };
  }
  return { success: true as const, fields };
}

/** Campanhas com métricas reais: envios/entregues/lidas, vendas/receita por atribuição e custo. */
export async function listCampaignsWithMetrics() {
  const supabaseAdmin = await admin();

  const [{ data: campaigns }, settings] = await Promise.all([
    supabaseAdmin.from("whatsapp_campaigns").select("*").order("created_at", { ascending: false }),
    loadSettings(),
  ]);

  const campaignList = (campaigns ?? []) as {
    id: string;
    nome: string;
    status: string;
    segment_type: string;
    template_name: string;
    template_language: string | null;
    message_type: string;
    coupon_code: string | null;
    body_params: unknown;
    origem: string | null;
    enviadas: number;
    falhas: number;
    total_destinatarios: number | null;
    created_at: string;
    sent_at: string | null;
    approved_at: string | null;
    rejected_at: string | null;
    reject_reason: string | null;
  }[];

  if (campaignList.length === 0) return [];

  const { data: recipients } = await supabaseAdmin
    .from("whatsapp_campaign_recipients")
    .select("campaign_id, phone, status, sent_at")
    .in(
      "campaign_id",
      campaignList.map((c) => c.id),
    );

  const recipientsByCampaign = new Map<string, { phone: string; status: string; sent_at: string | null }[]>();
  for (const r of recipients ?? []) {
    const list = recipientsByCampaign.get(r.campaign_id) ?? [];
    list.push({ phone: r.phone, status: r.status, sent_at: r.sent_at });
    recipientsByCampaign.set(r.campaign_id, list);
  }

  // ---------- Atribuição de vendas: cupom (exato) tem prioridade; senão, telefone + janela de dias ----------
  const couponToCampaign = new Map<string, string>();
  for (const c of campaignList) if (c.coupon_code) couponToCampaign.set(c.coupon_code.toUpperCase(), c.id);

  const { data: orders } = await supabaseAdmin
    .from("shopify_orders")
    .select("phone, total_price, processed_at, financial_status, raw_data")
    .neq("financial_status", "VOIDED")
    .neq("financial_status", "REFUNDED");

  const vendasPorCampanha = new Map<string, { vendas: number; receita: number }>();
  const addVenda = (campaignId: string, total: number) => {
    const agg = vendasPorCampanha.get(campaignId) ?? { vendas: 0, receita: 0 };
    agg.vendas += 1;
    agg.receita += total;
    vendasPorCampanha.set(campaignId, agg);
  };

  for (const o of orders ?? []) {
    if (!o.processed_at) continue;
    const total = Number(o.total_price ?? 0);

    const discountCodes = ((o.raw_data as any)?.discountCodes ?? []) as string[];
    const couponMatch = discountCodes.map((d) => d.toUpperCase()).find((d) => couponToCampaign.has(d));
    if (couponMatch) {
      addVenda(couponToCampaign.get(couponMatch)!, total);
      continue;
    }

    if (!o.phone) continue;
    const orderPhone = toE164(o.phone);
    if (!orderPhone) continue;
    const orderAt = new Date(o.processed_at).getTime();

    let bestCampaignId: string | null = null;
    let bestSentAt = -Infinity;
    for (const c of campaignList) {
      const recips = recipientsByCampaign.get(c.id) ?? [];
      const match = recips.find((r) => r.phone === orderPhone && r.status !== "failed" && r.sent_at);
      if (!match?.sent_at) continue;
      const sentAt = new Date(match.sent_at).getTime();
      if (sentAt > orderAt) continue;
      if (orderAt - sentAt > ATTRIBUTION_WINDOW_DAYS * DAY_MS) continue;
      if (sentAt > bestSentAt) {
        bestSentAt = sentAt;
        bestCampaignId = c.id;
      }
    }
    if (bestCampaignId) addVenda(bestCampaignId, total);
  }

  const costMarketing = settings.costMarketing ?? 0;
  const costUtility = settings.costUtility ?? 0;

  return campaignList.map((c) => {
    const recips = recipientsByCampaign.get(c.id) ?? [];
    const entregues = recips.filter((r) => r.status === "delivered" || r.status === "read").length;
    const lidas = recips.filter((r) => r.status === "read").length;
    const vendas = vendasPorCampanha.get(c.id)?.vendas ?? 0;
    const receita = vendasPorCampanha.get(c.id)?.receita ?? 0;
    const custoPorMsg = c.message_type === "utility" ? costUtility : costMarketing;

    return {
      id: c.id,
      nome: c.nome,
      status: c.status,
      segmentType: c.segment_type,
      messageType: c.message_type,
      templateName: c.template_name,
      templateLanguage: c.template_language ?? "pt_BR",
      bodyParams: Array.isArray(c.body_params) ? (c.body_params as string[]) : [],
      couponCode: c.coupon_code,
      origem: c.origem ?? "crm",
      enviadas: c.enviadas,
      falhas: c.falhas,
      totalDestinatarios: c.total_destinatarios ?? 0,
      entregues,
      lidas,
      vendas,
      receita,
      custo: Number((c.enviadas * custoPorMsg).toFixed(2)),
      createdAt: c.created_at,
      sentAt: c.sent_at,
      approvedAt: c.approved_at,
      rejectedAt: c.rejected_at,
      rejectReason: c.reject_reason,
    };
  });
}

export type AutomationDecisionCondition =
  | { kind: "novo_pedido" }
  | { kind: "pedido_status"; field: "financial_status" | "fulfillment_status"; value: string }
  | { kind: "segmento"; segmentType: string; segmentId?: string | undefined }
  | { kind: "valor_pedido"; operator: "gt" | "gte" | "lt" | "lte"; value: number }
  | { kind: "localizacao"; field: "city" | "province"; value: string }
  | { kind: "tag"; value: string };

export type AutomationStepInput =
  | {
      id: string;
      type: "send";
      waitMinutes: number;
      templateName: string;
      templateLanguage?: string | undefined;
      messageType: MessageType;
      bodyParams: string[];
      bodyParamTokens?: string[] | undefined;
      couponCode?: string | undefined;
      nextStepId: string | null;
    }
  | {
      id: string;
      type: "decision";
      condition: AutomationDecisionCondition;
      yesStepId: string | null;
      noStepId: string | null;
    };

export type AutomationInput = {
  id?: string | undefined;
  nome: string;
  descricao?: string | undefined;
  segmentType: string;
  segmentId?: string | undefined;
  steps: AutomationStepInput[];
  requerAprovacao: boolean;
  ativo: boolean;
  origem?: string | undefined;
};

export async function upsertAutomation(input: AutomationInput) {
  const supabaseAdmin = await admin();
  const settings = await loadSettings();

  const firstStep = input.steps[0];
  if (!firstStep) {
    return { success: false as const, error: "A automação precisa de pelo menos uma etapa." };
  }
  if (firstStep.type !== "send") {
    return { success: false as const, error: "A primeira etapa precisa ser um envio (não pode começar direto numa decisão)." };
  }

  const stepIds = new Set(input.steps.map((s) => s.id));
  const badRef = input.steps.find((s) => {
    if (s.type === "send") return s.nextStepId !== null && !stepIds.has(s.nextStepId);
    return (s.yesStepId !== null && !stepIds.has(s.yesStepId)) || (s.noStepId !== null && !stepIds.has(s.noStepId));
  });
  if (badRef) {
    return { success: false as const, error: `A etapa "${badRef.id}" aponta pra uma etapa que não existe mais.` };
  }

  const steps = input.steps.map((s) =>
    s.type === "send"
      ? {
          id: s.id,
          type: "send" as const,
          waitMinutes: s.waitMinutes,
          templateName: s.templateName.trim(),
          templateLanguage: s.templateLanguage?.trim() || settings.templateLanguage,
          messageType: s.messageType,
          bodyParams: s.bodyParams,
          bodyParamTokens: s.bodyParamTokens ?? [],
          couponCode: s.couponCode?.trim() || null,
          nextStepId: s.nextStepId,
        }
      : {
          id: s.id,
          type: "decision" as const,
          condition: s.condition,
          yesStepId: s.yesStepId,
          noStepId: s.noStepId,
        },
  );

  const row = {
    nome: input.nome,
    descricao: input.descricao?.trim() || null,
    segment_type: input.segmentType,
    segment_id: input.segmentId || null,
    steps,
    requer_aprovacao: input.requerAprovacao,
    ativo: input.ativo,
    origem: input.origem ?? "crm",
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await supabaseAdmin.from("whatsapp_automations").update(row as never).eq("id", input.id);
    if (error) return { success: false as const, error: error.message };
    return { success: true as const, id: input.id };
  }

  const { data, error } = await supabaseAdmin
    .from("whatsapp_automations")
    .insert(row as never)
    .select("id")
    .single();
  if (error || !data) return { success: false as const, error: error?.message ?? "Falha ao salvar a automação." };
  return { success: true as const, id: (data as { id: string }).id };
}

export async function listAutomationsRows() {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin
    .from("whatsapp_automations")
    .select("*")
    .order("created_at", { ascending: false });

  return ((data ?? []) as any[]).map((a) => ({
    id: a.id as string,
    nome: a.nome as string,
    descricao: (a.descricao ?? null) as string | null,
    segmentType: a.segment_type as string,
    segmentId: (a.segment_id ?? null) as string | null,
    steps: (Array.isArray(a.steps) ? a.steps : []) as AutomationStepInput[],
    requerAprovacao: a.requer_aprovacao as boolean,
    ativo: a.ativo as boolean,
    origem: (a.origem ?? "crm") as string,
    lastRunAt: (a.last_run_at ?? null) as string | null,
    totalExecucoes: (a.total_execucoes ?? 0) as number,
    createdAt: a.created_at as string,
  }));
}

/** Detalhe de 1 campanha — lista de destinatários com status, pra tela de "ver campanha". */
export async function getCampaignDetailRow(campaignId: string) {
  const supabaseAdmin = await admin();
  const { data: campaign } = await supabaseAdmin
    .from("whatsapp_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return null;

  const { data: recipients } = await supabaseAdmin
    .from("whatsapp_campaign_recipients")
    .select("phone, status, sent_at, delivered_at, read_at, error")
    .eq("campaign_id", campaignId)
    .order("sent_at", { ascending: false });

  return { campaign, recipients: recipients ?? [] };
}

/** Agrupa os erros reais de envio (retornados pela Meta) por motivo — usado na aba Relatórios. */
export async function getFailureBreakdown() {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin.from("whatsapp_campaign_recipients").select("error").eq("status", "failed");

  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    const motivo = r.error?.trim() || "Falha não categorizada";
    counts.set(motivo, (counts.get(motivo) ?? 0) + 1);
  }
  const total = Array.from(counts.values()).reduce((a, n) => a + n, 0);
  return Array.from(counts.entries())
    .map(([motivo, count]) => ({ motivo, count, pct: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0 }))
    .sort((a, b) => b.count - a.count);
}

/** Estatísticas de um template a partir do nosso próprio log de envios (soma de todas as campanhas que o usaram). */
export async function getTemplateStatsRows(templateName: string) {
  const supabaseAdmin = await admin();
  const { data: campaigns } = await supabaseAdmin.from("whatsapp_campaigns").select("id").eq("template_name", templateName);
  const campaignIds = (campaigns ?? []).map((c) => (c as { id: string }).id);
  if (campaignIds.length === 0) {
    return { enviados: 0, entregues: 0, lidos: 0, porDia: [] as { data: string; env: number; ent: number; lid: number }[] };
  }

  const { data: recipients } = await supabaseAdmin
    .from("whatsapp_campaign_recipients")
    .select("status, sent_at, delivered_at, read_at")
    .in("campaign_id", campaignIds);

  const list = recipients ?? [];
  const porDiaMap = new Map<string, { env: number; ent: number; lid: number }>();
  const bump = (date: string | null, key: "env" | "ent" | "lid") => {
    if (!date) return;
    const day = date.slice(0, 10);
    const agg = porDiaMap.get(day) ?? { env: 0, ent: 0, lid: 0 };
    agg[key]++;
    porDiaMap.set(day, agg);
  };
  for (const r of list) {
    if (r.status !== "failed") bump(r.sent_at, "env");
    bump(r.delivered_at, "ent");
    bump(r.read_at, "lid");
  }

  const porDia = Array.from(porDiaMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, v]) => ({ data, ...v }));

  return {
    enviados: list.filter((r) => r.status !== "failed").length,
    entregues: list.filter((r) => r.status === "delivered" || r.status === "read").length,
    lidos: list.filter((r) => r.status === "read").length,
    porDia,
  };
}

/** Duplica um template aprovado como novo rascunho (nome_copy_xxx) — Meta não deixa clonar direto. */
export async function duplicateTemplate(sourceName: string, components: unknown[], category: string, language: string) {
  const settings = await loadSettings();
  if (!settings.accessToken || !settings.wabaId) {
    return { success: false as const, error: "Configure o token de acesso e o WABA ID em Configurações." };
  }

  const newName = `${sourceName}_copy_${Date.now().toString(36)}`;
  const res = await fetch(`https://graph.facebook.com/v20.0/${settings.wabaId}/message_templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.accessToken}` },
    body: JSON.stringify({ name: newName, category, language, components }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { success: false as const, error: json?.error?.message ?? `Meta respondeu ${res.status}` };
  return { success: true as const, name: newName };
}

/** Edita o corpo de um template — se já estava aprovado, a Meta reenvia pra revisão automaticamente. */
export async function updateTemplateComponents(templateId: string, components: unknown[]) {
  const settings = await loadSettings();
  if (!settings.accessToken) return { success: false as const, error: "Configure o token de acesso em Configurações." };

  const res = await fetch(`https://graph.facebook.com/v20.0/${templateId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.accessToken}` },
    body: JSON.stringify({ components }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { success: false as const, error: json?.error?.message ?? `Meta respondeu ${res.status}` };
  return { success: true as const };
}

/** Apaga um template (todas as línguas com esse nome). */
export async function deleteTemplateByName(name: string) {
  const settings = await loadSettings();
  if (!settings.accessToken || !settings.wabaId) {
    return { success: false as const, error: "Configure o token de acesso e o WABA ID em Configurações." };
  }

  const res = await fetch(
    `https://graph.facebook.com/v20.0/${settings.wabaId}/message_templates?name=${encodeURIComponent(name)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${settings.accessToken}` } },
  );
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { success: false as const, error: json?.error?.message ?? `Meta respondeu ${res.status}` };
  return { success: true as const };
}
