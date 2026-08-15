import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { GOALS, SEGMENT_TYPES, type SegmentType } from "./crm-mock";

const DAY_MS = 86_400_000;
const ATTRIBUTION_WINDOW_DAYS = 3;
const segmentTypeSchema = z.enum(SEGMENT_TYPES);
const messageTypeSchema = z.enum(["marketing", "utility"]);

/** Converte telefone BR (com ou sem +55/DDI) pra E.164, exigido pela API do WhatsApp. */
function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return `+${digits}`;
}

/** IDs de clientes que batem com o segmento — calculado sobre o histórico completo, não o período do dashboard. */
async function getSegmentCustomerIds(segmentType: SegmentType): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
    const daysSinceFirst = (now - Math.min(...agg.dates)) / DAY_MS;

    let match = false;
    if (segmentType === "ticket_alto") match = avgTicket > GOALS.ticketMedio.regular;
    else if (segmentType === "sem_recompra") match = count === 1 && daysSinceFirst >= 14;
    else if (segmentType === "recompra_30d") match = count === 1 && daysSinceFirst <= 30;
    else if (segmentType === "recompra_60d") match = count === 1 && daysSinceFirst > 30 && daysSinceFirst <= 60;

    if (match) ids.push(customerId);
  }
  return ids;
}

async function getCustomersWithPhone(ids: string[]) {
  if (ids.length === 0) return [];
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("shopify_customers").select("id, phone, first_name").in("id", ids);
  return (data ?? []).filter((c) => Boolean(c.phone)) as { id: string; phone: string; first_name: string | null }[];
}

async function sendTemplateMessage(params: {
  accessToken: string;
  phoneNumberId: string;
  to: string;
  templateName: string;
  templateLanguage: string;
  bodyParams: string[];
  headerImageUrl?: string;
}) {
  const components: Record<string, unknown>[] = [];
  if (params.headerImageUrl) {
    components.push({ type: "header", parameters: [{ type: "image", image: { link: params.headerImageUrl } }] });
  }
  if (params.bodyParams.length) {
    components.push({ type: "body", parameters: params.bodyParams.map((text) => ({ type: "text", text })) });
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
  if (!res.ok) return { ok: false as const, error: json?.error?.message ?? `Meta respondeu ${res.status}` };
  const waMessageId: string | undefined = json?.messages?.[0]?.id;
  return { ok: true as const, waMessageId };
}

/** Status pra tela de Configurações — nunca devolve o token de acesso. */
export const getWhatsappMetaStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("store_settings")
    .select(
      "whatsapp_meta_access_token, whatsapp_meta_phone_number_id, whatsapp_meta_template_name, whatsapp_meta_template_language, whatsapp_meta_waba_id, whatsapp_meta_verify_token, whatsapp_cost_marketing, whatsapp_cost_utility",
    )
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let displayPhoneNumber: string | null = null;
  if (data?.whatsapp_meta_access_token && data?.whatsapp_meta_phone_number_id) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${data.whatsapp_meta_phone_number_id}?fields=display_phone_number`,
        { headers: { Authorization: `Bearer ${data.whatsapp_meta_access_token}` } },
      );
      if (res.ok) {
        const json: any = await res.json();
        displayPhoneNumber = json?.display_phone_number ?? null;
      }
    } catch {
      // sem número exibível não é crítico — segue com null
    }
  }

  return {
    hasAccessToken: Boolean(data?.whatsapp_meta_access_token),
    hasPhoneNumberId: Boolean(data?.whatsapp_meta_phone_number_id),
    hasWabaId: Boolean(data?.whatsapp_meta_waba_id),
    hasVerifyToken: Boolean(data?.whatsapp_meta_verify_token),
    templateName: data?.whatsapp_meta_template_name ?? "",
    templateLanguage: data?.whatsapp_meta_template_language ?? "pt_BR",
    costMarketing: data?.whatsapp_cost_marketing ?? null,
    costUtility: data?.whatsapp_cost_utility ?? null,
    displayPhoneNumber,
  };
});

/** Prévia de quantos clientes batem com o segmento antes de disparar de verdade — usada no passo 2 do wizard. */
export const previewSegment = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ segmentType: segmentTypeSchema }).parse(data))
  .handler(async ({ data }) => {
    const ids = await getSegmentCustomerIds(data.segmentType);
    const customers = await getCustomersWithPhone(ids);
    return { totalClientes: ids.length, comTelefone: customers.length };
  });

const saveSchema = z.object({
  accessToken: z.string().min(20).optional(),
  phoneNumberId: z.string().min(5).optional(),
  templateName: z.string().min(1).optional(),
  templateLanguage: z.string().min(2).optional(),
  wabaId: z.string().min(3).optional(),
  verifyToken: z.string().min(6).optional(),
  costMarketing: z.number().min(0).optional(),
  costUtility: z.number().min(0).optional(),
});

/** Salva as credenciais da API oficial da Meta — token nunca é devolvido ao cliente depois de salvo. */
export const saveWhatsappMetaSettings = createServerFn({ method: "POST" })
  .validator((data: unknown) => saveSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("store_settings")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!existing) {
      return { success: false as const, error: "Configure primeiro a conexão com o Shopify em Configurações." };
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.accessToken) patch["whatsapp_meta_access_token"] = data.accessToken.trim();
    if (data.phoneNumberId) patch["whatsapp_meta_phone_number_id"] = data.phoneNumberId.trim();
    if (data.templateName) patch["whatsapp_meta_template_name"] = data.templateName.trim();
    if (data.templateLanguage) patch["whatsapp_meta_template_language"] = data.templateLanguage.trim();
    if (data.wabaId) patch["whatsapp_meta_waba_id"] = data.wabaId.trim();
    if (data.verifyToken) patch["whatsapp_meta_verify_token"] = data.verifyToken.trim();
    if (data.costMarketing !== undefined) patch["whatsapp_cost_marketing"] = data.costMarketing;
    if (data.costUtility !== undefined) patch["whatsapp_cost_utility"] = data.costUtility;

    const { error } = await supabaseAdmin.from("store_settings").update(patch as never).eq("id", existing.id);
    if (error) return { success: false as const, error: error.message };
    return { success: true as const };
  });

const createCampaignSchema = z.object({
  nome: z.string().min(1),
  segmentType: segmentTypeSchema,
  messageType: messageTypeSchema.default("marketing"),
  couponCode: z.string().optional(),
  templateName: z.string().min(1).optional(),
  templateLanguage: z.string().min(2).optional(),
  headerImageUrl: z.string().url().optional(),
  bodyParams: z.array(z.string()).max(5).default([]),
});

/** Cria a campanha, dispara o template escolhido (ou o padrão da conta) pra todo mundo do segmento e loga cada envio. */
export const createAndSendCampaign = createServerFn({ method: "POST" })
  .validator((data: unknown) => createCampaignSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: settings } = await supabaseAdmin
      .from("store_settings")
      .select("whatsapp_meta_access_token, whatsapp_meta_phone_number_id, whatsapp_meta_template_name, whatsapp_meta_template_language")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const templateName = data.templateName ?? settings?.whatsapp_meta_template_name ?? undefined;
    const templateLanguage = data.templateLanguage ?? settings?.whatsapp_meta_template_language ?? "pt_BR";

    if (!settings?.whatsapp_meta_access_token || !settings?.whatsapp_meta_phone_number_id || !templateName) {
      return {
        success: false as const,
        error: "Configure o token de acesso e o Phone Number ID em Configurações, e escolha um template.",
      };
    }

    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from("whatsapp_campaigns")
      .insert({
        nome: data.nome,
        status: "enviando",
        segment_type: data.segmentType,
        template_name: templateName,
        message_type: data.messageType,
        coupon_code: data.couponCode?.trim() || null,
      } as never)
      .select("id")
      .single();

    if (campaignError || !campaign) {
      return { success: false as const, error: campaignError?.message ?? "Falha ao criar a campanha." };
    }
    const campaignId = (campaign as { id: string }).id;

    const ids = await getSegmentCustomerIds(data.segmentType);
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
        accessToken: settings.whatsapp_meta_access_token,
        phoneNumberId: settings.whatsapp_meta_phone_number_id,
        to,
        templateName,
        templateLanguage,
        bodyParams: data.bodyParams,
        ...(data.headerImageUrl ? { headerImageUrl: data.headerImageUrl } : {}),
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
      .update({ status: "finalizada", enviadas: sent, falhas: failed, sent_at: new Date().toISOString() } as never)
      .eq("id", campaignId);

    return { success: true as const, campaignId, total: customers.length, sent, failed, sampleErrors };
  });

const RANK: Record<string, number> = { sent: 0, delivered: 1, read: 2, failed: 3 };

/** Endpoint chamado pelo webhook da Meta (ver src/server.ts) — atualiza o status de entrega/leitura de cada mensagem. */
export async function applyMetaStatusUpdate(status: {
  id: string;
  status: string;
  timestamp?: string;
  errors?: { code?: number; title?: string; message?: string }[];
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("store_settings")
    .select("whatsapp_meta_verify_token")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.whatsapp_meta_verify_token ?? null;
}

/** Lista campanhas com métricas reais: envios/entregues/lidas do log de recipients, vendas/receita por atribuição, custo pela config. */
export const getCampaigns = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ data: campaigns }, { data: settings }] = await Promise.all([
    supabaseAdmin.from("whatsapp_campaigns").select("*").order("created_at", { ascending: false }),
    supabaseAdmin
      .from("store_settings")
      .select("whatsapp_cost_marketing, whatsapp_cost_utility")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const campaignList = (campaigns ?? []) as {
    id: string;
    nome: string;
    status: string;
    segment_type: string;
    template_name: string;
    message_type: string;
    coupon_code: string | null;
    enviadas: number;
    falhas: number;
    created_at: string;
    sent_at: string | null;
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

  const costMarketing = settings?.whatsapp_cost_marketing ?? 0;
  const costUtility = settings?.whatsapp_cost_utility ?? 0;

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
      couponCode: c.coupon_code,
      enviadas: c.enviadas,
      falhas: c.falhas,
      entregues,
      lidas,
      vendas,
      receita,
      custo: Number((c.enviadas * custoPorMsg).toFixed(2)),
      createdAt: c.created_at,
      sentAt: c.sent_at,
    };
  });
});

/** Agrupa os erros reais de envio (retornados pela Meta) por motivo — usado na aba Relatórios. */
export const getCampaignsFailureBreakdown = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
});

/** Templates aprovados no WABA — chamado pela aba "Templates" da página de Campanhas. */
export const listMetaTemplates = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: settings } = await supabaseAdmin
    .from("store_settings")
    .select("whatsapp_meta_access_token, whatsapp_meta_waba_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!settings?.whatsapp_meta_access_token || !settings?.whatsapp_meta_waba_id) {
    return { success: false as const, error: "Configure o token de acesso e o WABA ID em Configurações.", templates: [] };
  }

  const res = await fetch(
    `https://graph.facebook.com/v20.0/${settings.whatsapp_meta_waba_id}/message_templates?limit=100`,
    { headers: { Authorization: `Bearer ${settings.whatsapp_meta_access_token}` } },
  );
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) return { success: false as const, error: json?.error?.message ?? `Meta respondeu ${res.status}`, templates: [] };

  const templates = (json.data ?? []).map((t: any) => ({
    id: t.id as string,
    name: t.name as string,
    status: t.status as string,
    category: t.category as string,
    language: t.language as string,
    components: (t.components ?? []) as { type: string; text?: string; format?: string; buttons?: unknown[] }[],
  }));
  return { success: true as const, templates };
});

/** Detalhe de 1 campanha — lista de destinatários com status, pra tela de "ver campanha". */
export const getCampaignDetail = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ campaignId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: campaign } = await supabaseAdmin
      .from("whatsapp_campaigns")
      .select("*")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (!campaign) return null;

    const { data: recipients } = await supabaseAdmin
      .from("whatsapp_campaign_recipients")
      .select("phone, status, sent_at, delivered_at, read_at, error")
      .eq("campaign_id", data.campaignId)
      .order("sent_at", { ascending: false });

    return { campaign, recipients: recipients ?? [] };
  });

/** Duplica um template aprovado como novo rascunho (nome_copy) — Meta não deixa clonar direto, então recria os components. */
export const duplicateMetaTemplate = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ sourceName: z.string(), components: z.array(z.any()), category: z.string(), language: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("store_settings")
      .select("whatsapp_meta_access_token, whatsapp_meta_waba_id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!settings?.whatsapp_meta_access_token || !settings?.whatsapp_meta_waba_id) {
      return { success: false as const, error: "Configure o token de acesso e o WABA ID em Configurações." };
    }

    const newName = `${data.sourceName}_copy_${Date.now().toString(36)}`;
    const res = await fetch(`https://graph.facebook.com/v20.0/${settings.whatsapp_meta_waba_id}/message_templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.whatsapp_meta_access_token}` },
      body: JSON.stringify({ name: newName, category: data.category, language: data.language, components: data.components }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false as const, error: json?.error?.message ?? `Meta respondeu ${res.status}` };
    return { success: true as const, name: newName };
  });

/** Edita o corpo de um template — se já estava aprovado, a Meta reenvia pra revisão automaticamente. */
export const updateMetaTemplate = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ templateId: z.string(), components: z.array(z.any()) }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("store_settings")
      .select("whatsapp_meta_access_token")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!settings?.whatsapp_meta_access_token) {
      return { success: false as const, error: "Configure o token de acesso em Configurações." };
    }

    const res = await fetch(`https://graph.facebook.com/v20.0/${data.templateId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.whatsapp_meta_access_token}` },
      body: JSON.stringify({ components: data.components }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false as const, error: json?.error?.message ?? `Meta respondeu ${res.status}` };
    return { success: true as const };
  });

/** Apaga um template (todas as línguas com esse nome). */
export const deleteMetaTemplate = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ name: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("store_settings")
      .select("whatsapp_meta_access_token, whatsapp_meta_waba_id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!settings?.whatsapp_meta_access_token || !settings?.whatsapp_meta_waba_id) {
      return { success: false as const, error: "Configure o token de acesso e o WABA ID em Configurações." };
    }

    const res = await fetch(
      `https://graph.facebook.com/v20.0/${settings.whatsapp_meta_waba_id}/message_templates?name=${encodeURIComponent(data.name)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${settings.whatsapp_meta_access_token}` } },
    );
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) return { success: false as const, error: json?.error?.message ?? `Meta respondeu ${res.status}` };
    return { success: true as const };
  });

/** Estatísticas de um template a partir do nosso próprio log de envios (soma de todas as campanhas que o usaram). */
export const getTemplateStats = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ templateName: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: campaigns } = await supabaseAdmin
      .from("whatsapp_campaigns")
      .select("id")
      .eq("template_name", data.templateName);
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
  });
