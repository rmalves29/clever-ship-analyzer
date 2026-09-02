import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { z } from "zod";
import { SEGMENT_TYPES } from "./crm-mock";
export { getSegmentsList } from "./crm-segmentation.functions";

const segmentTypeSchema = z.string();
const messageTypeSchema = z.enum(["marketing", "utility"]);

/** Status pra tela de Configurações — nunca devolve o token de acesso nem o App Secret. */
export const getWhatsappMetaStatus = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async () => {
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
  .middleware([requireAppAuth])
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

/** Prévia do segmento: usa a mesma resolução do CRM que será congelada no enfileiramento. */
export const previewSegment = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ segmentType: z.string(), segmentId: z.string().uuid().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { resolveWhatsappSegmentAudience } = await import("./whatsapp-segment-resolver.server");
    const audience = await resolveWhatsappSegmentAudience(data.segmentType, data.segmentId);
    return {
      clientes: audience.clientes,
      comTelefone: audience.comTelefone,
      destinatarios: audience.destinatarios,
    };
  });

const createCampaignSchema = z.object({
  nome: z.string().min(1),
  segmentType: z.string(),
  segmentId: z.string().uuid().optional(),
  messageType: messageTypeSchema.default("marketing"),
  templateName: z.string().optional(),
  templateLanguage: z.string().optional(),
  couponCode: z.string().optional(),
  bodyParams: z.array(z.string()).max(10).default([]),
  bodyParamTokens: z.array(z.string()).max(10).optional(),
  requireApproval: z.boolean().default(false),
  sendAt: z.string().optional(),
  campaignTag: z.string().max(120).optional(),
});

function validateSendAt(sendAt: string | undefined): { success: true; value?: string } | { success: false; error: string } {
  if (!sendAt?.trim()) return { success: true };
  const date = new Date(sendAt);
  if (!Number.isFinite(date.getTime())) return { success: false, error: "Data de agendamento inválida." };
  if (date.getTime() <= Date.now()) return { success: false, error: "O horário agendado precisa estar no futuro." };
  return { success: true, value: date.toISOString() };
}

/** "Aplicar ação" no CRM: cria a campanha e apenas enfileira; o worker é o único ponto de envio real. */
export const createAndSendCampaign = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => createCampaignSchema.parse(data))
  .handler(async ({ data }) => {
    const schedule = validateSendAt(data.sendAt);
    if (!schedule.success) return { success: false as const, error: schedule.error };

    const [{ createCampaignRow }, { resolveWhatsappSegmentAudience }] = await Promise.all([
      import("./whatsapp-meta.server"),
      import("./whatsapp-segment-resolver.server"),
    ]);
    const audience = await resolveWhatsappSegmentAudience(data.segmentType, data.segmentId);

    const created = await createCampaignRow(
      {
        nome: data.nome,
        segmentType: data.segmentType,
        segmentId: data.segmentId,
        messageType: data.messageType,
        templateName: data.templateName,
        templateLanguage: data.templateLanguage,
        bodyParams: data.bodyParams,
        bodyParamTokens: data.bodyParamTokens,
        couponCode: data.couponCode,
        origem: "crm",
        campaignTag: data.campaignTag?.trim() || undefined,
        totalDestinatariosOverride: audience.destinatarios,
      },
      data.requireApproval ? "aguardando_aprovacao" : schedule.value ? "agendada" : "enviando",
    );
    if (!created.success) return created;

    if (data.requireApproval) {
      return {
        success: true as const,
        pendingApproval: true as const,
        campaignId: created.campaignId,
        total: audience.destinatarios,
        queued: 0,
        sent: 0,
        failed: 0,
        sampleErrors: [] as string[],
      };
    }

    const { enqueueCampaign } = await import("./whatsapp-queue.server");
    const result = await enqueueCampaign(created.campaignId, audience.ids, {
      ...(schedule.value ? { scheduledAt: schedule.value } : {}),
    });
    return { ...result, pendingApproval: false as const };
  });

/** Aprova uma campanha pendente e enfileira o público pelo mesmo motor usado na prévia. */
export const approveCampaign = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ campaignId: z.string().uuid(), approvedBy: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { dispatchCampaign } = await import("./whatsapp-meta.server");
    const { markRunsWaitingForApprovedCampaign } = await import("./automations-engine.server");

    const { data: row } = await supabaseAdmin
      .from("whatsapp_campaigns")
      .select("id, status, segment_type, segment_id")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (!row) return { success: false as const, error: "Campanha não encontrada." };

    const { data: pendingRuns } = await supabaseAdmin
      .from("whatsapp_automation_runs")
      .select("customer_id")
      .eq("campaign_id", data.campaignId)
      .eq("status", "pending_approval");
    const runCustomerIds = ((pendingRuns ?? []) as { customer_id: string }[]).map((r) => r.customer_id);

    // Uma campanha de automação reaproveitada pode já estar "enviando"/"finalizada" por causa de
    // um lote anterior (refreshCampaignStatus manda nesse status a partir da fila) mesmo tendo
    // gente nova esperando aprovação agora — por isso runs pendentes bastam pra liberar aprovar,
    // independente do status agregado da campanha.
    if ((row as { status: string }).status !== "aguardando_aprovacao" && runCustomerIds.length === 0) {
      return { success: false as const, error: "Essa campanha não está aguardando aprovação." };
    }

    await supabaseAdmin
      .from("whatsapp_campaigns")
      .update({ approved_at: new Date().toISOString(), approved_by: data.approvedBy ?? "painel" } as never)
      .eq("id", data.campaignId);

    let resolvedIds = runCustomerIds;
    if (resolvedIds.length === 0) {
      const { resolveWhatsappSegmentCustomerIds } = await import("./whatsapp-segment-resolver.server");
      resolvedIds = await resolveWhatsappSegmentCustomerIds(
        String((row as any).segment_type ?? ""),
        (row as any).segment_id || undefined,
      );
    }

    if (runCustomerIds.length > 0) await markRunsWaitingForApprovedCampaign(data.campaignId);
    return dispatchCampaign(data.campaignId, resolvedIds);
  });

/** Rejeita uma campanha pendente — nada é enviado. Se for um lote de automação, os runs pendentes
 *  ficam `failed` (não removidos — a trava de matrícula única impede reenrollment automático). */
export const rejectCampaign = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ campaignId: z.string().uuid(), reason: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { failRunsForRejectedCampaign } = await import("./automations-engine.server");
    const reason = data.reason?.trim() || "rejeitado";

    const { data: row } = await supabaseAdmin
      .from("whatsapp_campaigns")
      .select("id, status")
      .eq("id", data.campaignId)
      .maybeSingle();
    if (!row) return { success: false as const, error: "Campanha não encontrada." };

    const { data: pendingRuns } = await supabaseAdmin
      .from("whatsapp_automation_runs")
      .select("id")
      .eq("campaign_id", data.campaignId)
      .eq("status", "pending_approval");
    const hasPendingRuns = (pendingRuns ?? []).length > 0;
    const isAwaitingApproval = (row as { status: string }).status === "aguardando_aprovacao";
    if (!isAwaitingApproval && !hasPendingRuns) {
      return { success: false as const, error: "Essa campanha não está aguardando aprovação." };
    }

    // Só reescreve o status agregado da campanha pra "rejeitada" quando ela ainda não tem envio
    // real — numa campanha reaproveitada que já enviou antes, sobrescrever aqui corromperia o
    // status real (refreshCampaignStatus continua sendo a fonte da verdade nesse caso).
    if (isAwaitingApproval) {
      const { error } = await supabaseAdmin
        .from("whatsapp_campaigns")
        .update({
          status: "rejeitada",
          rejected_at: new Date().toISOString(),
          reject_reason: reason,
        } as never)
        .eq("id", data.campaignId)
        .eq("status", "aguardando_aprovacao");
      if (error) return { success: false as const, error: error.message };
    }

    await failRunsForRejectedCampaign(data.campaignId, reason);
    return { success: true as const };
  });

/** Lista campanhas com métricas reais de envio, entrega, vendas e custo. */
export const getCampaigns = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async () => {
  const { listCampaignsWithMetrics } = await import("./whatsapp-meta.server");
  return listCampaignsWithMetrics();
});

/** Templates aprovados no WABA — usado nas telas de campanha e automação. */
export const listMetaTemplates = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async () => {
  const { listMetaTemplates: listTemplates } = await import("./whatsapp-meta.server");
  return listTemplates();
});

/** Detalhe de 1 campanha — lista de destinatários com status, pra tela de "ver campanha". */
export const getCampaignDetail = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ campaignId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { getCampaignDetailRow } = await import("./whatsapp-meta.server");
    return getCampaignDetailRow(data.campaignId);
  });

/** Motivos de falha reais (retornados pela Meta), agrupados — usado na aba Relatórios. */
export const getCampaignsFailureBreakdown = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async () => {
  const { getFailureBreakdown } = await import("./whatsapp-meta.server");
  return getFailureBreakdown();
});

/** Estatísticas de um template (soma de todas as campanhas que o usaram). */
export const getTemplateStats = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ templateName: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { getTemplateStatsRows } = await import("./whatsapp-meta.server");
    return getTemplateStatsRows(data.templateName);
  });

const templateComponentSchema = z.union([
  z.object({ type: z.literal("HEADER"), format: z.literal("TEXT"), text: z.string().min(1) }),
  z.object({ type: z.literal("BODY"), text: z.string().min(1) }),
  z.object({ type: z.literal("FOOTER"), text: z.string().min(1) }),
  z.object({
    type: z.literal("BUTTONS"),
    buttons: z
      .array(
        z.union([
          z.object({ type: z.literal("QUICK_REPLY"), text: z.string().min(1) }),
          z.object({
            type: z.literal("URL"),
            text: z.string().min(1),
            url: z.string().min(1),
            example: z.array(z.string().min(1)).optional(),
          }),
        ]),
      )
      .min(1),
  }),
]);

/** Cria um template novo no WABA — entra em revisão da Meta, some do "PENDING" quando ela decide. */
export const createMetaTemplate = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z
      .object({
        name: z.string().min(1),
        category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
        language: z.string().min(2),
        components: z.array(templateComponentSchema).min(1),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { createTemplate } = await import("./whatsapp-meta.server");
    return createTemplate(data);
  });

/** Liga o campo `message_template_status_update` no webhook do App — sem isso a Meta nunca manda
 *  o evento de aprovação/rejeição de template (o webhook de status de entrega já funciona à parte). */
export const activateTemplateStatusWebhook = createServerFn({ method: "POST" })
  .middleware([requireAppAuth]).handler(async () => {
  const { ensureTemplateStatusWebhookSubscribed } = await import("./whatsapp-meta.server");
  return ensureTemplateStatusWebhookSubscribed();
});

/** Feed de aprovações/rejeições recentes — pra aba Templates não depender só do botão "Atualizar". */
export const getRecentTemplateEvents = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async () => {
  const { getRecentTemplateEvents: getEvents } = await import("./whatsapp-meta.server");
  return getEvents();
});

/** Duplica um template aprovado como novo rascunho. */
export const duplicateMetaTemplate = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z.object({ sourceName: z.string(), components: z.array(z.any()), category: z.string(), language: z.string() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { duplicateTemplate } = await import("./whatsapp-meta.server");
    return duplicateTemplate(data.sourceName, data.components, data.category, data.language);
  });

/** Edita o corpo de um template — se já estava aprovado, a Meta reenvia pra revisão automaticamente. */
export const updateMetaTemplate = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ templateId: z.string(), components: z.array(z.any()) }).parse(data))
  .handler(async ({ data }) => {
    const { updateTemplateComponents } = await import("./whatsapp-meta.server");
    return updateTemplateComponents(data.templateId, data.components);
  });

/** Apaga um template (todas as línguas com esse nome). */
export const deleteMetaTemplate = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ name: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { deleteTemplateByName } = await import("./whatsapp-meta.server");
    return deleteTemplateByName(data.name);
  });

const decisionConditionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("novo_pedido") }),
  z.object({
    kind: z.literal("pedido_status"),
    field: z.enum(["financial_status", "fulfillment_status"]),
    value: z.string().min(1),
  }),
  z.object({
    kind: z.literal("segmento"),
    segmentType: z.string().min(1),
    segmentId: z.string().uuid().optional(),
  }),
  z.object({
    kind: z.literal("valor_pedido"),
    operator: z.enum(["gt", "gte", "lt", "lte"]),
    value: z.number(),
  }),
  z.object({
    kind: z.literal("localizacao"),
    field: z.enum(["city", "province"]),
    value: z.string().min(1),
  }),
  z.object({
    kind: z.literal("tag"),
    value: z.string().min(1),
  }),
]);

const sendStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal("send"),
  waitMinutes: z.number().int().min(0).max(43200),
  waitValue: z.number().int().min(0).max(43200).optional(),
  waitUnit: z.enum(["minutes", "days"]).optional(),
  templateName: z.string().min(1),
  templateLanguage: z.string().optional(),
  messageType: messageTypeSchema.default("marketing"),
  bodyParams: z.array(z.string()).max(10).default([]),
  bodyParamTokens: z.array(z.string()).max(10).optional(),
  couponCode: z.string().optional(),
  nextStepId: z.string().nullable().default(null),
});

const decisionStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal("decision"),
  condition: decisionConditionSchema,
  yesStepId: z.string().nullable().default(null),
  noStepId: z.string().nullable().default(null),
});

const automationStepSchema = z.discriminatedUnion("type", [sendStepSchema, decisionStepSchema]);

const automationSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().min(1),
  descricao: z.string().optional(),
  segmentType: segmentTypeSchema,
  segmentId: z.string().uuid().optional(),
  steps: z.array(automationStepSchema).min(1),
  requerAprovacao: z.boolean().default(true),
  ativo: z.boolean().default(true),
  origem: z.string().optional(),
});

/** Cria ou atualiza uma automação (régua) — usada tanto na página do WhatsApp quanto no CRM. */
export const saveAutomation = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => automationSchema.parse(data))
  .handler(async ({ data }) => {
    const { upsertAutomation } = await import("./whatsapp-meta.server");
    return upsertAutomation(data);
  });

export const listAutomations = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async () => {
  const { listAutomationsRows } = await import("./whatsapp-meta.server");
  return listAutomationsRows();
});

export const toggleAutomation = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
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
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("whatsapp_automations").delete().eq("id", data.id);
    if (error) return { success: false as const, error: error.message };
    return { success: true as const };
  });

/** Roda a automação agora: matricula clientes novos do segmento e processa quem já pode avançar
 *  de etapa — mesmo motor do tick agendado, só que escopado a essa automação e ignorando "pausada". */
export const runAutomationNow = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { runAutomationsTick } = await import("./automations-engine.server");
    const result = await runAutomationsTick({ automationId: data.id, force: true });
    return { success: true as const, ...result };
  });

/** Contagem de runs por status/etapa de todas as automações — badges e "ver funil" na UI. */
export const getAutomationRunMetrics = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async () => {
  const { getAllAutomationRunMetrics } = await import("./automations-engine.server");
  return getAllAutomationRunMetrics();
});

/** Recebe o "code" do popup de Embedded Signup da Meta e troca por token, salvando tudo automaticamente. */
export const finishEmbeddedSignup = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z.object({ code: z.string().min(5), phoneNumberId: z.string().min(3), wabaId: z.string().min(3) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { exchangeEmbeddedSignupCode } = await import("./whatsapp-meta.server");
    return exchangeEmbeddedSignupCode(data);
  });

/** Roda um lote do worker da fila manualmente (botão "processar fila" no painel).
 *  Envio real acontece só aqui e no tick HTTP `/api/whatsapp/queue-tick`. */
export const runWhatsappQueueTick = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z.object({ limit: z.number().int().min(1).max(200).optional(), dryRun: z.boolean().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const { processWhatsappQueueBatch } = await import("./whatsapp-queue.server");
    return processWhatsappQueueBatch({
      ...(data.limit ? { limit: data.limit } : {}),
      ...(data.dryRun ? { dryRun: true } : {}),
    });
  });

/** Envia uma mensagem de teste de uma etapa de automação (ainda em edição) pro número informado. */
export const sendAutomationTestMessage = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z
      .object({
        phone: z.string().min(8),
        templateName: z.string().min(1),
        templateLanguage: z.string().min(2),
        bodyParams: z.array(z.string()),
        bodyParamTokens: z.array(z.string()).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { sendAutomationTestMessage: sendTest } = await import("./whatsapp-meta.server");
    return sendTest(data);
  });

/** Cancela os itens ainda não enviados de uma campanha. */
export const cancelWhatsappCampaignQueue = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ campaignId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { cancelCampaignQueue } = await import("./whatsapp-queue.server");
    return cancelCampaignQueue(data.campaignId);
  });

/** Contadores da fila de uma campanha (queued/sending/retry_wait/sent/failed/cancelled/skipped). */
export const getWhatsappCampaignQueueStatus = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ campaignId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { refreshCampaignStatus } = await import("./whatsapp-queue.server");
    return refreshCampaignStatus(data.campaignId);
  });
