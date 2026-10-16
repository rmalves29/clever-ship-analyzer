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
  text: z.string().max(4096),
  buttonText: z.string().max(20).nullable().optional(),
  buttonUrl: z.string().url().nullable().optional(),
  mediaType: z.enum(["image", "audio", "video"]).nullable().optional(),
  mediaUrl: z.string().url().nullable().optional(),
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
  triggerButtonSteps: z.record(z.string(), z.string()).optional(),
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
    const emptySend = data.steps.find((s) => s.type === "send" && !s.text.trim() && !(s.mediaType && s.mediaUrl));
    if (emptySend) return { success: false as const, error: "Cada etapa de envio precisa de texto ou de uma mídia." };
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
    const buttonSteps = data.triggerType === "button_click" ? data.triggerButtonSteps : undefined;
    if (buttonSteps) {
      const byId = new Map(data.steps.map((s) => [s.id, s]));
      const bad = Object.entries(buttonSteps).find(([, id]) => {
        const target = byId.get(id);
        return !target || (target.type !== "send" && target.type !== "menu");
      });
      if (bad) return { success: false as const, error: `O botão "${bad[0]}" precisa apontar pra uma etapa de Enviar WhatsApp ou Menu.` };
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
      trigger_button_steps: buttonSteps && Object.keys(buttonSteps).length ? buttonSteps : null,
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

/** Templates que podem disparar o fluxo ao clicar num botão: todos os modelos aprovados da Meta que têm botão de
 *  resposta rápida, mais qualquer nome já usado em campanha (inclui o "texto livre" dos fluxos conversacionais). */
export const getRecentlyUsedTemplateNames = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const names = new Set<string>();

  try {
    const { listMetaTemplates } = await import("./whatsapp-meta.server");
    const result = await listMetaTemplates();
    if (result.success) {
      for (const t of result.templates) {
        if (t.status !== "APPROVED") continue;
        const buttons = (t.components.find((c) => c.type === "BUTTONS") as { buttons?: Array<{ type?: string }> } | undefined)?.buttons ?? [];
        if (buttons.some((b) => b.type === "QUICK_REPLY")) names.add(t.name);
      }
    }
  } catch (error) {
    console.error("Falha ao listar modelos da Meta para o gatilho de botão:", error);
  }

  // Nomes já usados em campanhas (distintos): varre em páginas porque o volume de campanhas é grande.
  const seen = new Set<string>();
  for (let page = 0; page < 20; page++) {
    const { data } = await supabaseAdmin
      .from("whatsapp_campaigns")
      .select("template_name")
      .order("created_at", { ascending: false })
      .range(page * 1000, page * 1000 + 999);
    const rows = (data ?? []) as { template_name: string | null }[];
    for (const row of rows) if (row.template_name) seen.add(row.template_name);
    if (rows.length < 1000) break;
  }
  for (const name of seen) names.add(name);

  return Array.from(names).sort((a, b) => a.localeCompare(b, "pt-BR"));
});

export type TemplateButtonOption = { type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "OTHER"; text: string; url?: string };
export type TemplateWithButtons = { name: string; category: string; language: string; header: string | null; body: string; footer: string | null; buttons: TemplateButtonOption[] };

/** Modelos aprovados da Meta que têm botão de resposta rápida, já com o texto da mensagem e a
 *  lista de botões — alimenta o seletor do gatilho "Clique em botão" do fluxo conversacional. */
export const getTemplatesWithButtons = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async (): Promise<TemplateWithButtons[]> => {
  const { listMetaTemplates } = await import("./whatsapp-meta.server");
  const result = await listMetaTemplates();
  if (!result.success) return [];
  const out: TemplateWithButtons[] = [];
  for (const t of result.templates) {
    if (t.status !== "APPROVED") continue;
    const comps = t.components as Array<{ type: string; text?: string; format?: string; buttons?: Array<{ type?: string; text?: string; url?: string }> }>;
    const buttons: TemplateButtonOption[] = (comps.find((c) => c.type === "BUTTONS")?.buttons ?? [])
      .filter((b) => b.text)
      .map((b) => ({
        type: b.type === "QUICK_REPLY" ? "QUICK_REPLY" : b.type === "URL" ? "URL" : b.type === "PHONE_NUMBER" ? "PHONE_NUMBER" : "OTHER",
        text: String(b.text),
        ...(b.url ? { url: b.url } : {}),
      }));
    if (!buttons.some((b) => b.type === "QUICK_REPLY")) continue;
    const header = comps.find((c) => c.type === "HEADER" && c.format === "TEXT")?.text ?? null;
    out.push({
      name: t.name,
      category: t.category,
      language: t.language,
      header,
      body: comps.find((c) => c.type === "BODY")?.text ?? "",
      footer: comps.find((c) => c.type === "FOOTER")?.text ?? null,
      buttons,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
});

const MEDIA_RULES = {
  image: { mimes: ["image/jpeg", "image/png"], maxBytes: 5 * 1024 * 1024, label: "Imagem (JPG ou PNG, até 5 MB)" },
  audio: { mimes: ["audio/aac", "audio/mp4", "audio/mpeg", "audio/amr", "audio/ogg"], maxBytes: 16 * 1024 * 1024, label: "Áudio (MP3, M4A, AAC, AMR ou OGG, até 16 MB)" },
  video: { mimes: ["video/mp4", "video/3gpp"], maxBytes: 16 * 1024 * 1024, label: "Vídeo (MP4 ou 3GP, até 16 MB)" },
} as const;

/** Alguns navegadores informam tipos "alternativos" pro mesmo arquivo (mp3, m4a, ogg com codec). */
function normalizeMime(raw: string): string {
  const base = raw.split(";")[0]!.trim().toLowerCase();
  if (base === "audio/mp3" || base === "audio/x-mpeg" || base === "audio/mpeg3") return "audio/mpeg";
  if (base === "audio/x-m4a" || base === "audio/m4a") return "audio/mp4";
  if (base === "image/jpg") return "image/jpeg";
  return base;
}

/** Gera um endereço de envio direto do navegador para o armazenamento (o arquivo não passa pelo
 *  servidor, que tem limite de tamanho de requisição). Valida tipo e tamanho pelas regras do
 *  WhatsApp antes de liberar. */
export const createConversationMediaUpload = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) =>
    z
      .object({
        mediaType: z.enum(["image", "audio", "video"]),
        fileName: z.string().min(1).max(200),
        contentType: z.string().max(100),
        size: z.number().int().positive(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const rules = MEDIA_RULES[data.mediaType];
    const contentType = normalizeMime(data.contentType);
    if (!(rules.mimes as readonly string[]).includes(contentType)) {
      return { success: false as const, error: `Formato não aceito pelo WhatsApp. ${rules.label}.` };
    }
    if (data.size > rules.maxBytes) {
      return { success: false as const, error: `Arquivo grande demais. ${rules.label}.` };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `conversation/${Date.now()}-${safeName}`;
    const { data: signed, error } = await supabaseAdmin.storage.from("flow-uploads").createSignedUploadUrl(path);
    if (error || !signed) return { success: false as const, error: error?.message ?? "Não consegui preparar o envio do arquivo." };
    const { data: pub } = supabaseAdmin.storage.from("flow-uploads").getPublicUrl(path);
    return { success: true as const, signedUrl: signed.signedUrl, publicUrl: pub.publicUrl, contentType };
  });
