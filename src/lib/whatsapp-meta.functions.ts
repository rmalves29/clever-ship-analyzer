import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { SEGMENT_TYPES } from "./crm-mock";

const segmentTypeSchema = z.enum(SEGMENT_TYPES);
const messageTypeSchema = z.enum(["marketing", "utility"]);

/** Status pra tela de Configurações — nunca devolve o token de acesso nem o App Secret. */
export const getWhatsappMetaStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { loadSettings } = await import("./whatsapp-meta.server");
  const s = await loadSettings();
  return {
    hasAccessToken: Boolean(s.accessToken),
    hasPhoneNumberId: Boolean(s.phoneNumberId),
    hasWabaId: Boolean(s.wabaId),
    hasVerifyToken: Boolean(s.verifyToken),
    templateName: s.templateName ?? "",
    templateLanguage: s.templateLanguage,
    costMarketing: s.costMarketing,
    costUtility: s.costUtility,
    appId: s.appId,
    hasAppSecret: Boolean(s.appSecret),
    configId: s.configId,
  };
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
  appId: z.string().min(5).optional(),
  appSecret: z.string().min(10).optional(),
  configId: z.string().min(5).optional(),
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
    if (data.appId) patch["whatsapp_meta_app_id"] = data.appId.trim();
    if (data.appSecret) patch["whatsapp_meta_app_secret"] = data.appSecret.trim();
    if (data.configId) patch["whatsapp_meta_config_id"] = data.configId.trim();

    const { error } = await supabaseAdmin.from("store_settings").update(patch as never).eq("id", existing.id);
    if (error) return { success: false as const, error: error.message };
    return { success: true as const };
  });

/** Prévia do segmento: quantos clientes reais receberiam a mensagem agora. */
export const previewSegment = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ segmentType: segmentTypeSchema }).parse(data))
  .handler(async ({ data }) => {
    const { countSegmentRecipients } = await import("./whatsapp-meta.server");
    return countSegmentRecipients(data.segmentType);
  });

const createCampaignSchema = z.object({
  nome: z.string().min(1),
  segmentType: segmentTypeSchema,
  messageType: messageTypeSchema.default("marketing"),
  templateName: z.string().optional(),
  templateLanguage: z.string().optional(),
  couponCode: z.string().optional(),
  bodyParams: z.array(z.string()).max(5).default([]),
  requireApproval: z.boolean().default(false),
});

/** "Aplicar ação" no CRM: cria a campanha e envia na hora, ou manda pra fila de aprovação. */
export const createAndSendCampaign = createServerFn({ method: "POST" })
  .validator((data: unknown) => createCampaignSchema.parse(data))
  .handler(async ({ data }) => {
    const { createCampaignRow, dispatchCampaign } = await import("./whatsapp-meta.server");

    const created = await createCampaignRow(
      {
        nome: data.nome,
        segmentType: data.segmentType,
        messageType: data.messageType,
        templateName: data.templateName,
        templateLanguage: data.templateLanguage,
        bodyParams: data.bodyParams,
        couponCode: data.couponCode,
        origem: "crm",
      },
      data.requireApproval ? "aguardando_aprovacao" : "enviando",
    );
    if (!created.success) return created;

    if (data.requireApproval) {
      return {
        success: true as const,
        pendingApproval: true as const,
        campaignId: created.campaignId,
        total: created.destinatarios,
        sent: 0,
        failed: 0,
        sampleErrors: [] as string[],
      };
    }

    const result = await dispatchCampaign(created.campaignId);
    return { ...result, pendingApproval: false as const };
  });

/** Aprova uma campanha pendente e dispara os envios. */
export const approveCampaign = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ campaignId: z.string().uuid(), approvedBy: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { dispatchCampaign } = await import("./whatsapp-meta.server");

    const { data: row } = await supabaseAdmin
      .from("whatsapp_campaigns")
      .select("id, status")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (!row) return { success: false as const, error: "Campanha não encontrada." };
    if ((row as { status: string }).status !== "aguardando_aprovacao") {
      return { success: false as const, error: "Essa campanha não está aguardando aprovação." };
    }

    await supabaseAdmin
      .from("whatsapp_campaigns")
      .update({ approved_at: new Date().toISOString(), approved_by: data.approvedBy ?? "painel" } as never)
      .eq("id", data.campaignId);

    return dispatchCampaign(data.campaignId);
  });

/** Rejeita uma campanha pendente — nada é enviado. */
export const rejectCampaign = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ campaignId: z.string().uuid(), reason: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("whatsapp_campaigns")
      .update({
        status: "rejeitada",
        rejected_at: new Date().toISOString(),
        reject_reason: data.reason?.trim() || null,
      } as never)
      .eq("id", data.campaignId)
      .eq("status", "aguardando_aprovacao");
    if (error) return { success: false as const, error: error.message };
    return { success: true as const };
  });

/** Lista campanhas com métricas reais de envio, entrega, vendas e custo. */
export const getCampaigns = createServerFn({ method: "GET" }).handler(async () => {
  const { listCampaignsWithMetrics } = await import("./whatsapp-meta.server");
  return listCampaignsWithMetrics();
});

/** Templates aprovados no WABA — usado nas telas de campanha e automação. */
export const listMetaTemplates = createServerFn({ method: "GET" }).handler(async () => {
  const { loadSettings } = await import("./whatsapp-meta.server");
  const settings = await loadSettings();

  if (!settings.accessToken || !settings.wabaId) {
    return { success: false as const, error: "Configure o token de acesso e o WABA ID em Configurações.", templates: [] };
  }

  const res = await fetch(`https://graph.facebook.com/v20.0/${settings.wabaId}/message_templates?limit=100`, {
    headers: { Authorization: `Bearer ${settings.accessToken}` },
  });
  const json: any = await res.json().catch(() => ({}));
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
});

/** Detalhe de 1 campanha — lista de destinatários com status, pra tela de "ver campanha". */
export const getCampaignDetail = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ campaignId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { getCampaignDetailRow } = await import("./whatsapp-meta.server");
    return getCampaignDetailRow(data.campaignId);
  });

/** Motivos de falha reais (retornados pela Meta), agrupados — usado na aba Relatórios. */
export const getCampaignsFailureBreakdown = createServerFn({ method: "GET" }).handler(async () => {
  const { getFailureBreakdown } = await import("./whatsapp-meta.server");
  return getFailureBreakdown();
});

/** Estatísticas de um template (soma de todas as campanhas que o usaram). */
export const getTemplateStats = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ templateName: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { getTemplateStatsRows } = await import("./whatsapp-meta.server");
    return getTemplateStatsRows(data.templateName);
  });

/** Duplica um template aprovado como novo rascunho. */
export const duplicateMetaTemplate = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ sourceName: z.string(), components: z.array(z.any()), category: z.string(), language: z.string() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { duplicateTemplate } = await import("./whatsapp-meta.server");
    return duplicateTemplate(data.sourceName, data.components, data.category, data.language);
  });

/** Edita o corpo de um template — se já estava aprovado, a Meta reenvia pra revisão automaticamente. */
export const updateMetaTemplate = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ templateId: z.string(), components: z.array(z.any()) }).parse(data))
  .handler(async ({ data }) => {
    const { updateTemplateComponents } = await import("./whatsapp-meta.server");
    return updateTemplateComponents(data.templateId, data.components);
  });

/** Apaga um template (todas as línguas com esse nome). */
export const deleteMetaTemplate = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ name: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { deleteTemplateByName } = await import("./whatsapp-meta.server");
    return deleteTemplateByName(data.name);
  });

const automationSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().min(1),
  descricao: z.string().optional(),
  segmentType: segmentTypeSchema,
  templateName: z.string().optional(),
  templateLanguage: z.string().optional(),
  messageType: messageTypeSchema.default("marketing"),
  bodyParams: z.array(z.string()).max(5).default([]),
  couponCode: z.string().optional(),
  janelaHoras: z.number().int().min(1).max(720).default(24),
  requerAprovacao: z.boolean().default(true),
  ativo: z.boolean().default(true),
  origem: z.string().optional(),
});

/** Cria ou atualiza uma automação (régua) — usada tanto na página do WhatsApp quanto no CRM. */
export const saveAutomation = createServerFn({ method: "POST" })
  .validator((data: unknown) => automationSchema.parse(data))
  .handler(async ({ data }) => {
    const { upsertAutomation } = await import("./whatsapp-meta.server");
    return upsertAutomation(data);
  });

export const listAutomations = createServerFn({ method: "GET" }).handler(async () => {
  const { listAutomationsRows } = await import("./whatsapp-meta.server");
  return listAutomationsRows();
});

export const toggleAutomation = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid(), ativo: z.boolean() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("whatsapp_automations")
      .update({ ativo: data.ativo, updated_at: new Date().toISOString() } as never)
      .eq("id", data.id);
    if (error) return { success: false as const, error: error.message };
    return { success: true as const };
  });

export const deleteAutomation = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("whatsapp_automations").delete().eq("id", data.id);
    if (error) return { success: false as const, error: error.message };
    return { success: true as const };
  });

/** Roda a automação agora — cria a campanha e envia, ou coloca na fila de aprovação. */
export const runAutomationNow = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { runAutomation } = await import("./whatsapp-meta.server");
    return runAutomation(data.id, true);
  });

/** Recebe o "code" do popup de Embedded Signup da Meta e troca por token, salvando tudo automaticamente. */
export const finishEmbeddedSignup = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ code: z.string().min(5), phoneNumberId: z.string().min(3), wabaId: z.string().min(3) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { exchangeEmbeddedSignupCode } = await import("./whatsapp-meta.server");
    return exchangeEmbeddedSignupCode(data);
  });
