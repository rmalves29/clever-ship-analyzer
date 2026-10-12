import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAuth } from "./app-auth";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
}

type TemplateInfo = {
  name: string;
  language: string;
  status: string;
  category: string;
  quickReplies: string[];
  params: number;
};

/** Modelos da Meta que servem de convite (têm botões de resposta rápida), com o status de aprovação. */
async function loadInviteTemplates(): Promise<{ templates: TemplateInfo[]; error?: string }> {
  const { listMetaTemplates } = await import("./whatsapp-meta.server");
  const res = await listMetaTemplates();
  if (!res.success) return { templates: [], error: res.error };
  const templates = (res.templates as any[])
    .map((t): TemplateInfo => {
      const body: string = t.components?.find((c: any) => c.type === "BODY")?.text ?? "";
      const quick = (t.components ?? []).filter((c: any) => c.type === "BUTTONS").flatMap((c: any) => (c.buttons ?? []).filter((b: any) => b.type === "QUICK_REPLY").map((b: any) => String(b.text)));
      return { name: t.name, language: t.language, status: t.status, category: t.category, quickReplies: quick, params: new Set(body.match(/\{\{\d+\}\}/g) ?? []).size };
    })
    .filter((t) => t.quickReplies.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { templates };
}

/** Tela "WhatsApp" de uma pesquisa: configuração, modelos disponíveis, pendências da loja, andamento e etapas esperando a equipe. */
export const getSurveyWaOverview = createServerFn({ method: "GET" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ surveyId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const db = await admin();
    const [{ pendingForWhatsapp }, { normalizeAnswer }] = await Promise.all([import("./survey-wa.server"), import("./survey-wa")]);
    const [{ data: survey }, { data: config }, { data: runs }, tpl] = await Promise.all([
      db.from("surveys").select("id, title, questions").eq("id", data.surveyId).maybeSingle(),
      db.from("survey_wa_config").select("*").eq("survey_id", data.surveyId).maybeSingle(),
      db.from("survey_wa_runs").select("id, phone, status, node_id, started_at, context").eq("survey_id", data.surveyId).order("started_at", { ascending: false }).limit(500),
      loadInviteTemplates(),
    ]);
    if (!survey) return null;
    const questions = Array.isArray(survey.questions) ? survey.questions : [];
    const first = questions[0];
    const inviteOptions: string[] = first?.type === "escolha_unica" ? (first.options ?? []) : [];

    const counts: Record<string, number> = {};
    for (const r of (runs ?? []) as any[]) counts[r.status] = (counts[r.status] ?? 0) + 1;

    const chosen = tpl.templates.find((t) => t.name === config?.template_name);
    const optionKeys = new Set(inviteOptions.map(normalizeAnswer));
    const unmatchedButtons = chosen ? chosen.quickReplies.filter((b) => !optionKeys.has(normalizeAnswer(b))) : [];

    return {
      title: survey.title as string,
      config: config ? { templateName: config.template_name as string | null, enabled: Boolean(config.enabled), expireHours: Number(config.expire_hours ?? 24) } : { templateName: null, enabled: false, expireHours: 24 },
      templates: tpl.templates,
      templatesError: tpl.error ?? null,
      inviteOptions,
      unmatchedButtons,
      pending: pendingForWhatsapp(questions),
      counts,
      waitingTeam: ((runs ?? []) as any[]).filter((r) => r.status === "waiting_team").map((r) => ({ id: r.id as string, phone: r.phone as string, node: r.node_id as string, since: r.started_at as string })),
    };
  });

/** Escolhe o modelo-convite e liga/desliga o envio. Só liga com modelo aprovado, botões iguais às opções da 1ª etapa e sem pendência da loja. */
export const saveSurveyWaConfig = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ surveyId: z.string().uuid(), templateName: z.string().max(200).nullable(), enabled: z.boolean(), expireHours: z.number().int().min(1).max(72) }).parse(data))
  .handler(async ({ data }): Promise<{ success: true } | { success: false; error: string }> => {
    const db = await admin();
    const { pendingForWhatsapp } = await import("./survey-wa.server");
    const { normalizeAnswer } = await import("./survey-wa");

    let templateLanguage = "pt_BR";
    if (data.enabled) {
      if (!data.templateName) return { success: false, error: "Escolha o modelo de convite antes de ligar." };
      const { data: survey } = await db.from("surveys").select("questions").eq("id", data.surveyId).maybeSingle();
      const questions = Array.isArray(survey?.questions) ? survey.questions : [];
      const pending = pendingForWhatsapp(questions);
      if (pending.length > 0) {
        return { success: false, error: `Ainda há decisões da loja em aberto nos textos: ${[...new Set(pending.map((p) => `[${p.text}]`))].join(", ")}. Preencha na aba Perguntas antes de ligar.` };
      }
      const first = questions[0];
      if (first?.type !== "escolha_unica") return { success: false, error: "A 1ª etapa precisa ser o convite com botões (escolha única)." };
      const { templates } = await loadInviteTemplates();
      const tpl = templates.find((t) => t.name === data.templateName);
      if (!tpl) return { success: false, error: "Modelo não encontrado na Meta (ou sem botões de resposta rápida)." };
      if (tpl.status !== "APPROVED") return { success: false, error: `O modelo está "${tpl.status}". Só dá para ligar depois de aprovado pela Meta.` };
      const options = new Set((first.options ?? []).map((o: string) => normalizeAnswer(o)));
      const bad = tpl.quickReplies.filter((b) => !options.has(normalizeAnswer(b)));
      if (bad.length > 0) return { success: false, error: `Os botões do modelo (${bad.join(", ")}) não batem com as opções da 1ª etapa da pesquisa. Ajuste um dos dois.` };
      templateLanguage = tpl.language;
    }

    const { error } = await db.from("survey_wa_config").upsert(
      { survey_id: data.surveyId, template_name: data.templateName, template_language: templateLanguage, enabled: data.enabled, expire_hours: data.expireHours, updated_at: new Date().toISOString() },
      { onConflict: "survey_id" },
    );
    if (error) return { success: false, error: error.message };
    return { success: true };
  });

/** Manda o convite (modelo aprovado) para UM telefone, para testar a conversa inteira. Registra o envio para o clique abrir a pesquisa. */
export const sendSurveyTestInvite = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ surveyId: z.string().uuid(), phone: z.string().min(8).max(25), nome: z.string().max(60).optional(), pedido: z.string().max(30).optional() }).parse(data))
  .handler(async ({ data }): Promise<{ success: true } | { success: false; error: string }> => {
    const db = await admin();
    const { toE164, loadSettings, sendTemplateMessage, createCampaignRow } = await import("./whatsapp-meta.server");
    const phone = toE164(data.phone);
    if (!phone) return { success: false, error: "Telefone inválido." };
    const { data: config } = await db.from("survey_wa_config").select("template_name, template_language").eq("survey_id", data.surveyId).maybeSingle();
    if (!config?.template_name) return { success: false, error: "Escolha o modelo de convite primeiro." };
    const { templates } = await loadInviteTemplates();
    const tpl = templates.find((t) => t.name === config.template_name);
    if (!tpl || tpl.status !== "APPROVED") return { success: false, error: `O modelo ainda não está aprovado (${tpl?.status ?? "não encontrado"}).` };
    const { data: survey } = await db.from("surveys").select("title").eq("id", data.surveyId).maybeSingle();

    const params = [data.nome?.trim() || "Teste", data.pedido?.trim() || "1042"].slice(0, tpl.params);
    const settings = await loadSettings();
    if (!settings.accessToken || !settings.phoneNumberId) return { success: false, error: "WhatsApp (Meta) não configurado." };

    const created = await createCampaignRow(
      { nome: `Teste de pesquisa · ${survey?.title ?? ""}`, segmentType: "custom", messageType: tpl.category === "UTILITY" ? "utility" : "marketing", templateName: tpl.name, templateLanguage: tpl.language, bodyParams: params, origem: "pesquisa", totalDestinatariosOverride: 1 },
      "enviando",
    );
    if (!created.success) return { success: false, error: created.error };
    const result = await sendTemplateMessage({ accessToken: settings.accessToken, phoneNumberId: settings.phoneNumberId, to: phone, templateName: tpl.name, templateLanguage: tpl.language, bodyParams: params });
    if (!result.ok) {
      await db.from("wa_campaigns").update({ status: "erro", last_error: result.error }).eq("id", created.campaignId);
      return { success: false, error: result.error };
    }
    await db.from("wa_campaign_recipients").insert({ campaign_id: created.campaignId, phone, name: params[0] ?? null, params, status: "sent", wa_message_id: result.waMessageId ?? null, sent_at: new Date().toISOString(), event_key: "" });
    await db.from("wa_campaigns").update({ status: "finalizada", sent_at: new Date().toISOString() }).eq("id", created.campaignId);
    return { success: true };
  });

/** A equipe resolveu o atendimento: envia a etapa que estava esperando (ex.: "conseguimos resolver?"). */
export const resumeSurveyRun = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => z.object({ runId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { resumeRunAfterTeam } = await import("./survey-wa.server");
    return resumeRunAfterTeam(data.runId);
  });
