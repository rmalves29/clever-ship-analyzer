import { GOALS, type SegmentType } from "./crm-mock";

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

/** Converte telefone BR (com ou sem +55/DDI) pra E.164, exigido pela API do WhatsApp. */
export function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return `+${digits}`;
}

/** IDs de clientes que batem com o segmento — calculado sobre o histórico completo, não o período do dashboard. */
export async function getSegmentCustomerIds(segmentType: SegmentType | string): Promise<string[]> {
  const supabaseAdmin = await admin();

  if (segmentType === "envio_atrasado") {
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
    if (segmentType === "ticket_alto") match = avgTicket > GOALS.ticketMedio.regular;
    else if (segmentType === "sem_recompra") match = count === 1; 
    else if (segmentType === "recorrencia") match = count > 1;
    else if (segmentType === "recompra_30d") match = count >= 1;
    else if (segmentType === "recompra_60d") match = count >= 1;
    else if (segmentType === "envio_atrasado") match = true;

    if (match) ids.push(customerId);
  }

  if (ids.length > 0) return ids;

  const { data: customSegment } = await supabaseAdmin
    .from("crm_segments")
    .select("id, regras")
    .eq("id", segmentType)
    .maybeSingle();

  if (customSegment) {
    const { data: staticMembers } = await supabaseAdmin
      .from("crm_list_members")
      .select("customer_id")
      .eq("lista_id", segmentType);
    
    if (staticMembers?.length) return staticMembers.map(m => m.customer_id);

    const { data: allCustomers } = await supabaseAdmin
      .from("shopify_customers")
      .select("id, email, city, province, phone");

    if (allCustomers && (customSegment.regras as any)?.groups) {
      const groups = (customSegment.regras as any).groups;
      return allCustomers.filter(c => {
        return groups.some((g: any) => {
          if (!g.conditions?.length) return false;
          return g.conditions.every((cond: any) => {
            const val = String(c[cond.field as keyof typeof c] || "").toLowerCase();
            const target = String(cond.value || "").toLowerCase();
            if (cond.operator === "eq") return val === target;
            if (cond.operator === "contains") return val.includes(target);
            if (cond.operator === "starts_with") return val.startsWith(target);
            return false;
          });
        });
      }).map(c => c.id);
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

export async function countSegmentRecipients(segmentType: SegmentType) {
  const ids = await getSegmentCustomerIds(segmentType);
  const customers = await getCustomersWithPhone(ids);
  const validos = customers.filter((c) => toE164(c.phone));
  return { clientes: ids.length, comTelefone: customers.length, destinatarios: validos.length };
}

async function sendTemplateMessage(params: {
  accessToken: string;
  phoneNumberId: string;
  to: string;
  templateName: string;
  templateLanguage: string;
  bodyParams: string[];
}) {
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
        ...(params.bodyParams.length
          ? { components: [{ type: "body", parameters: params.bodyParams.map((text) => ({ type: "text", text })) }] }
          : {}),
      },
    }),
  });

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[sendTemplateMessage] Error", { status: res.status, body: json });
    return { ok: false as const, error: json?.error?.message ?? `Meta respondeu ${res.status}` };
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

  segmentType: SegmentType;
  messageType: MessageType;
  templateName?: string | undefined;
  templateLanguage?: string | undefined;
  bodyParams: string[];
  couponCode?: string | undefined;
  origem?: string | undefined;
  automationId?: string | undefined;
};

/** Cria a campanha no banco (sem enviar). Status inicial define se vai pra fila de aprovação. */
export async function createCampaignRow(input: NewCampaignInput, status: "aguardando_aprovacao" | "enviando") {
  const supabaseAdmin = await admin();
  const settings = await loadSettings();

  const templateName = input.templateName?.trim() || settings.templateName;
  if (!settings.accessToken || !settings.phoneNumberId || !templateName) {
    return {
      success: false as const,
      error: "Configure o token de acesso, o Phone Number ID e o template do WhatsApp (Meta) em Configurações.",
    };
  }

  const { destinatarios } = await countSegmentRecipients(input.segmentType);

  const { data: campaign, error } = await supabaseAdmin
    .from("whatsapp_campaigns")
    .insert({
      nome: input.nome,
      status,
      segment_type: input.segmentType,
      template_name: templateName,
      template_language: input.templateLanguage?.trim() || settings.templateLanguage,
      message_type: input.messageType,
      body_params: input.bodyParams,
      coupon_code: input.couponCode?.trim() || null,
      origem: input.origem ?? "crm",
      automation_id: input.automationId ?? null,
      total_destinatarios: destinatarios,
    } as never)
    .select("id")
    .single();

  if (error || !campaign) return { success: false as const, error: error?.message ?? "Falha ao criar a campanha." };
  return { success: true as const, campaignId: (campaign as { id: string }).id, destinatarios };
}

/** Dispara de fato a campanha já criada e loga cada envio. */
export async function dispatchCampaign(campaignId: string) {
  const supabaseAdmin = await admin();
  const settings = await loadSettings();

  const { data: campaignRow } = await supabaseAdmin
    .from("whatsapp_campaigns")
    .select("id, segment_type, template_name, template_language, body_params")
    .eq("id", campaignId)
    .maybeSingle();

  if (!campaignRow) return { success: false as const, error: "Campanha não encontrada." };
  if (!settings.accessToken || !settings.phoneNumberId) {
    return { success: false as const, error: "Credenciais do WhatsApp (Meta) não configuradas." };
  }

  const campaign = campaignRow as {
    id: string;
    segment_type: string;
    template_name: string;
    template_language: string | null;
    body_params: unknown;
  };

  await supabaseAdmin.from("whatsapp_campaigns").update({ status: "enviando" } as never).eq("id", campaignId);

  const bodyParams = Array.isArray(campaign.body_params) ? (campaign.body_params as string[]) : [];
  const ids = await getSegmentCustomerIds(campaign.segment_type as SegmentType);
  const customers = await getCustomersWithPhone(ids);

  let sent = 0;
  let failed = 0;
  const sampleErrors: string[] = [];

  for (const c of customers) {
    const to = toE164(c.phone);
    if (!to) {
      failed++;
      continue;
    }
    const result = await sendTemplateMessage({
      accessToken: settings.accessToken,
      phoneNumberId: settings.phoneNumberId,
      to,
      templateName: campaign.template_name,
      templateLanguage: campaign.template_language ?? settings.templateLanguage,
      bodyParams,
    });

    await supabaseAdmin.from("whatsapp_campaign_recipients").insert({
      campaign_id: campaignId,
      customer_id: c.id,
      phone: to,
      wa_message_id: result.ok ? (result.waMessageId ?? null) : null,
      status: result.ok ? "sent" : "failed",
      error: result.ok ? null : result.error,
    } as never);

    if (result.ok) sent++;
    else {
      failed++;
      if (sampleErrors.length < 3) sampleErrors.push(result.error);
    }
  }

  await supabaseAdmin
    .from("whatsapp_campaigns")
    .update({
      status: "finalizada",
      enviadas: sent,
      falhas: failed,
      total_destinatarios: customers.length,
      sent_at: new Date().toISOString(),
    } as never)
    .eq("id", campaignId);

  return { success: true as const, campaignId, total: customers.length, sent, failed, sampleErrors };
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

export type AutomationInput = {
  id?: string | undefined;
  nome: string;
  descricao?: string | undefined;
  segmentType: SegmentType;
  templateName?: string | undefined;
  templateLanguage?: string | undefined;
  messageType: MessageType;
  bodyParams: string[];
  couponCode?: string | undefined;
  janelaHoras: number;
  requerAprovacao: boolean;
  ativo: boolean;
  origem?: string | undefined;
};

export async function upsertAutomation(input: AutomationInput) {
  const supabaseAdmin = await admin();
  const settings = await loadSettings();
  const templateName = input.templateName?.trim() || settings.templateName;
  if (!templateName) {
    return { success: false as const, error: "Configure um template do WhatsApp (Meta) em Configurações." };
  }

  const row = {
    nome: input.nome,
    descricao: input.descricao?.trim() || null,
    segment_type: input.segmentType,
    template_name: templateName,
    template_language: input.templateLanguage?.trim() || settings.templateLanguage,
    message_type: input.messageType,
    body_params: input.bodyParams,
    coupon_code: input.couponCode?.trim() || null,
    janela_horas: input.janelaHoras,
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
    templateName: a.template_name as string,
    templateLanguage: (a.template_language ?? "pt_BR") as string,
    messageType: a.message_type as string,
    bodyParams: (Array.isArray(a.body_params) ? a.body_params : []) as string[],
    couponCode: (a.coupon_code ?? null) as string | null,
    janelaHoras: a.janela_horas as number,
    requerAprovacao: a.requer_aprovacao as boolean,
    ativo: a.ativo as boolean,
    origem: (a.origem ?? "crm") as string,
    lastRunAt: (a.last_run_at ?? null) as string | null,
    totalExecucoes: (a.total_execucoes ?? 0) as number,
    createdAt: a.created_at as string,
  }));
}

/** Executa uma automação agora: cria a campanha e envia (ou manda pra aprovação). */
export async function runAutomation(automationId: string, force = false) {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin
    .from("whatsapp_automations")
    .select("*")
    .eq("id", automationId)
    .maybeSingle();
  if (!data) return { success: false as const, error: "Automação não encontrada." };

  const a = data as any;
  if (!a.ativo && !force) return { success: false as const, error: "Automação está pausada." };

  const created = await createCampaignRow(
    {
      nome: a.nome,
      segmentType: a.segment_type as SegmentType,
      messageType: a.message_type as MessageType,
      templateName: a.template_name,
      templateLanguage: a.template_language,
      bodyParams: Array.isArray(a.body_params) ? (a.body_params as string[]) : [],
      couponCode: a.coupon_code ?? undefined,
      origem: "automacao",
      automationId,
    },
    a.requer_aprovacao ? "aguardando_aprovacao" : "enviando",
  );
  if (!created.success) return created;

  await supabaseAdmin
    .from("whatsapp_automations")
    .update({
      last_run_at: new Date().toISOString(),
      total_execucoes: (a.total_execucoes ?? 0) + 1,
    } as never)
    .eq("id", automationId);

  if (a.requer_aprovacao) {
    return {
      success: true as const,
      pendingApproval: true as const,
      campaignId: created.campaignId,
      destinatarios: created.destinatarios,
    };
  }

  const dispatched = await dispatchCampaign(created.campaignId);
  return { ...dispatched, pendingApproval: false as const };
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
