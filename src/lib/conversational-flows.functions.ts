import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { z } from "zod";

const decisionConditionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("novo_pedido") }),
  z.object({ kind: z.literal("pedido_status"), field: z.enum(["financial_status", "fulfillment_status"]), value: z.string().min(1) }),
  z.object({ kind: z.literal("segmento"), segmentType: z.string().min(1), segmentId: z.string().uuid().optional() }),
  z.object({ kind: z.literal("valor_pedido"), operator: z.enum(["gt", "gte", "lt", "lte"]), value: z.number() }),
  z.object({ kind: z.literal("localizacao"), field: z.enum(["city", "province"]), value: z.string().min(1) }),
  z.object({ kind: z.literal("tag"), value: z.string().min(1) }),
]);

const convSendStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal("send"),
  waitMinutes: z.number().int().min(0).max(43_200),
  text: z.string().min(1).max(4096),
  buttonText: z.string().max(20).nullable().optional(),
  buttonUrl: z.string().url().nullable().optional(),
  nextStepId: z.string().nullable().default(null),
});

const decisionStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal("decision"),
  condition: decisionConditionSchema,
  yesStepId: z.string().nullable().default(null),
  noStepId: z.string().nullable().default(null),
});

const convMenuOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(20),
  nextStepId: z.string().nullable().default(null),
});

const convMenuStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal("menu"),
  waitMinutes: z.number().int().min(0).max(43_200),
  text: z.string().min(1).max(4096),
  options: z.array(convMenuOptionSchema).min(1).max(3),
});

const convStepSchema = z.discriminatedUnion("type", [convSendStepSchema, convMenuStepSchema, decisionStepSchema]);

const flowSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().min(1),
  descricao: z.string().optional(),
  ativo: z.boolean().default(true),
  triggerType: z.enum(["button_click", "keyword", "unanswered_timeout"]),
  triggerTemplateName: z.string().optional(),
  triggerValues: z.array(z.string().min(1)).optional().default([]),
  triggerTimeoutMinutes: z.number().int().min(1).max(1440).optional(),
  steps: z.array(convStepSchema).min(1),
});

/** Cria ou atualiza um fluxo conversacional. Valida que o 1º passo é um envio e que toda
 *  referência (nextStepId/yesStepId/noStepId) aponta pra um id que existe entre os steps. */
export const saveConversationalFlow = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => flowSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const firstStep = data.steps[0];
    if (!firstStep || (firstStep.type !== "send" && firstStep.type !== "menu")) {
      return { success: false as const, error: "A primeira etapa precisa ser um envio ou um menu (não pode começar direto numa decisão)." };
    }
    const stepIds = new Set(data.steps.map((s) => s.id));
    const badRef = data.steps.find((s) => {
      if (s.type === "send") return s.nextStepId !== null && !stepIds.has(s.nextStepId);
      if (s.type === "menu") return s.options.some((o) => o.nextStepId !== null && !stepIds.has(o.nextStepId));
      return (s.yesStepId !== null && !stepIds.has(s.yesStepId)) || (s.noStepId !== null && !stepIds.has(s.noStepId));
    });
    if (badRef) return { success: false as const, error: `A etapa "${badRef.id}" aponta pra uma etapa que não existe mais.` };
    if (data.triggerType === "button_click" && !data.triggerTemplateName) {
      return { success: false as const, error: "Escolha o template cujo clique de botão dispara esse fluxo." };
    }
    if ((data.triggerType === "button_click" || data.triggerType === "keyword") && data.triggerValues.length === 0) {
      return { success: false as const, error: "Informe pelo menos um valor de gatilho (palavra-chave ou texto do botão)." };
    }
    if (data.triggerType === "unanswered_timeout" && !data.triggerTimeoutMinutes) {
      return { success: false as const, error: "Informe depois de quantos minutos sem resposta o bot deve entrar." };
    }

    const row = {
      nome: data.nome,
      descricao: data.descricao?.trim() || null,
      ativo: data.ativo,
      trigger_type: data.triggerType,
      trigger_template_name: data.triggerType === "button_click" ? data.triggerTemplateName : null,
      trigger_values: data.triggerValues,
      trigger_timeout_minutes: data.triggerType === "unanswered_timeout" ? data.triggerTimeoutMinutes : null,
      steps: data.steps,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from("whatsapp_conversational_flows").update(row as never).eq("id", data.id);
      if (error) return { success: false as const, error: error.message };
      return { success: true as const, id: data.id };
    }
    const { data: inserted, error } = await supabaseAdmin.from("whatsapp_conversational_flows").insert(row as never).select("id").single();
    if (error) return { success: false as const, error: error.message };
    return { success: true as const, id: (inserted as { id: string }).id };
  });

export const listConversationalFlows = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("whatsapp_conversational_flows").select("*").order("created_at", { ascending: false });
  return (data ?? []) as any[];
});

export const toggleConversationalFlow = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid(), ativo: z.boolean() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("whatsapp_conversational_flows")
      .update({ ativo: data.ativo, updated_at: new Date().toISOString() } as never)
      .eq("id", data.id);
    if (error) return { success: false as const, error: error.message };
    return { success: true as const };
  });

export const deleteConversationalFlow = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("whatsapp_conversational_flows").delete().eq("id", data.id);
    if (error) return { success: false as const, error: error.message };
    return { success: true as const };
  });

/** Contagem de runs por status/etapa de todos os fluxos — badges na listagem. */
export const getConversationRunMetrics = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("whatsapp_conversation_runs").select("flow_id, status");
  const rows = (data ?? []) as { flow_id: string; status: string }[];
  const result: Record<string, { total: number; byStatus: Record<string, number> }> = {};
  for (const r of rows) {
    const entry = result[r.flow_id] ?? { total: 0, byStatus: {} };
    entry.total++;
    entry.byStatus[r.status] = (entry.byStatus[r.status] ?? 0) + 1;
    result[r.flow_id] = entry;
  }
  return result;
});

/** Templates usados em campanhas recentes — pra escolher no gatilho "clique em botão" (só templates
 *  que já foram de fato enviados têm botões conhecidos, diferente da lista completa da Meta). */
export const getRecentlyUsedTemplateNames = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("whatsapp_campaigns")
    .select("template_name")
    .order("created_at", { ascending: false })
    .limit(50);
  const names = Array.from(new Set(((data ?? []) as { template_name: string }[]).map((c) => c.template_name)));
  return names;
});
