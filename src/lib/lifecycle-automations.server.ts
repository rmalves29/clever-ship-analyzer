import {
  CASHBACK_AUTOMATION_NAME,
  RFM_AUTOMATION_BLUEPRINTS,
  buildCashbackAutomationSteps,
  buildRFMAutomationSteps,
  type LifecycleSendStepBlueprint,
} from "./lifecycle-automation-blueprints";
import {
  CASHBACK_FINAL_TEMPLATE,
  CASHBACK_RELEASED_TEMPLATE,
  CASHBACK_REMINDER_TEMPLATE,
  LIFECYCLE_TEMPLATE_DEFINITIONS,
  rfmTemplatesForSegment,
  type LifecycleTemplateDefinition,
} from "./lifecycle-whatsapp-templates";
import type { Json } from "@/integrations/supabase/types";

type ExistingLifecycleAutomation = {
  id: string;
  automation_kind: string;
  trigger_config: Json;
  steps: Json;
  ativo: boolean;
};

type AutomationInstallResult = {
  automationsCreated: number;
  automationsUpdated: number;
  segmentsCreated: number;
};

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function rfmSegmentFromTrigger(triggerConfig: Json): string | null {
  if (!triggerConfig || typeof triggerConfig !== "object" || Array.isArray(triggerConfig)) {
    return null;
  }
  const segment = triggerConfig["rfmSegment"];
  return typeof segment === "string" && segment.trim() ? segment : null;
}

function configureStep(
  step: LifecycleSendStepBlueprint,
  template: LifecycleTemplateDefinition,
): LifecycleSendStepBlueprint {
  return {
    ...step,
    templateName: template.name,
    templateLanguage: template.language,
    messageType: "marketing",
    bodyParams: [...template.bodyParams],
    bodyParamTokens: [...template.bodyParamTokens],
  };
}

function configuredRFMSteps(
  blueprint: (typeof RFM_AUTOMATION_BLUEPRINTS)[number],
): LifecycleSendStepBlueprint[] {
  const templates = rfmTemplatesForSegment(blueprint.segment);
  return buildRFMAutomationSteps(blueprint).map((step, index) =>
    configureStep(step, templates[index === 0 ? 0 : 1]),
  );
}

function configuredCashbackSteps(): LifecycleSendStepBlueprint[] {
  return buildCashbackAutomationSteps().map((step) => {
    const template =
      step.id === "cashback-liberado"
        ? CASHBACK_RELEASED_TEMPLATE
        : step.id === "cashback-final"
          ? CASHBACK_FINAL_TEMPLATE
          : CASHBACK_REMINDER_TEMPLATE;
    return configureStep(step, template);
  });
}

function needsMessageConfiguration(rawSteps: unknown): boolean {
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) return true;
  const sendSteps = rawSteps
    .filter((step): step is Record<string, unknown> => Boolean(step) && typeof step === "object")
    .filter((step) => step["type"] === "send");
  return (
    sendSteps.length === 0 || sendSteps.every((step) => !String(step["templateName"] ?? "").trim())
  );
}

async function ensureRFMSegments(): Promise<{ created: number; idsByName: Map<string, string> }> {
  const [{ supabaseAdmin }, { CRM_RFM_SEGMENT_TEMPLATES, buildPersistedRulesFromTemplate }] =
    await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("./crm-segment-templates"),
    ]);
  const { data: existing, error } = await supabaseAdmin.from("crm_segments").select("id, nome");
  if (error) throw new Error(`Não foi possível conferir os segmentos RFM: ${error.message}`);

  const idsByName = new Map<string, string>(
    (existing ?? []).map((row) => [
      String(row.nome).trim().toLocaleLowerCase("pt-BR"),
      String(row.id),
    ]),
  );
  const missing = CRM_RFM_SEGMENT_TEMPLATES.filter(
    (template) => !idsByName.has(template.name.trim().toLocaleLowerCase("pt-BR")),
  );
  if (missing.length > 0) {
    const now = new Date().toISOString();
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("crm_segments")
      .insert(
        missing.map((template) => ({
          nome: template.name,
          descricao: template.description,
          regras: buildPersistedRulesFromTemplate(template),
          criado_em: now,
          atualizado_em: now,
        })) as never,
      )
      .select("id, nome");
    if (insertError)
      throw new Error(`Não foi possível criar os segmentos RFM: ${insertError.message}`);
    for (const row of inserted ?? []) {
      idsByName.set(String(row.nome).trim().toLocaleLowerCase("pt-BR"), String(row.id));
    }
  }
  return { created: missing.length, idsByName };
}

async function installAutomationDrafts(): Promise<AutomationInstallResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const segments = await ensureRFMSegments();
  const { data: existingRows, error } = await supabaseAdmin
    .from("whatsapp_automations")
    .select("id, automation_kind, trigger_config, steps, ativo");
  if (error)
    throw new Error(`Não foi possível conferir as automações existentes: ${error.message}`);

  const existingRFM = new Map<string, ExistingLifecycleAutomation>();
  let existingCashback: ExistingLifecycleAutomation | null = null;
  for (const row of (existingRows ?? []) as ExistingLifecycleAutomation[]) {
    const rfmSegment = rfmSegmentFromTrigger(row.trigger_config);
    if (row.automation_kind === "rfm" && rfmSegment) {
      existingRFM.set(rfmSegment, row);
    }
    if (row.automation_kind === "cashback" && !existingCashback) existingCashback = row;
  }

  let automationsCreated = 0;
  let automationsUpdated = 0;
  const now = new Date().toISOString();

  for (const blueprint of RFM_AUTOMATION_BLUEPRINTS) {
    const segmentId = segments.idsByName.get(
      `rfm — ${blueprint.segment}`.toLocaleLowerCase("pt-BR"),
    );
    if (!segmentId)
      throw new Error(`O segmento RFM — ${blueprint.segment} não pôde ser localizado.`);
    const existing = existingRFM.get(blueprint.segment);
    const configuredSteps = configuredRFMSteps(blueprint);
    const common = {
      nome: `RFM — ${blueprint.segment}`,
      descricao: `${blueprint.description} Os intervalos podem ser alterados antes de ativar.`,
      segment_type: "custom",
      segment_id: segmentId,
      requer_aprovacao: false,
      origem: "rfm",
      reentry_mode: "per_segment_entry",
      reentry_after_days: null,
      automation_kind: "rfm",
      trigger_config: toJson({
        rfmSegment: blueprint.segment,
        recommendedFirstDay: blueprint.firstWaitDays,
        recommendedSecondGapDays: blueprint.secondWaitDays,
      }),
      updated_at: now,
    };
    if (existing) {
      const { error: updateError } = await supabaseAdmin
        .from("whatsapp_automations")
        .update({
          ...common,
          ...(needsMessageConfiguration(existing.steps) ? { steps: toJson(configuredSteps) } : {}),
        })
        .eq("id", existing.id);
      if (updateError)
        throw new Error(`Falha ao configurar ${common.nome}: ${updateError.message}`);
      automationsUpdated++;
    } else {
      const { error: insertError } = await supabaseAdmin.from("whatsapp_automations").insert({
        ...common,
        steps: toJson(configuredSteps),
        ativo: false,
      });
      if (insertError) throw new Error(`Falha ao criar ${common.nome}: ${insertError.message}`);
      automationsCreated++;
    }
  }

  const cashbackSteps = configuredCashbackSteps();
  const cashbackCommon = {
    nome: CASHBACK_AUTOMATION_NAME,
    descricao:
      "Avisa quando o cashback é liberado e reforça 7, 3 e 1 dia antes, além do último aviso 3 horas antes de expirar.",
    segment_type: "cashback_expiring",
    segment_id: null,
    requer_aprovacao: false,
    origem: "cashback",
    reentry_mode: "per_order",
    reentry_after_days: null,
    automation_kind: "cashback",
    trigger_config: toJson({ stopWhenUsed: true, stopWhenExpired: true }),
    updated_at: now,
  };
  if (existingCashback) {
    const { error: updateError } = await supabaseAdmin
      .from("whatsapp_automations")
      .update({
        ...cashbackCommon,
        ...(needsMessageConfiguration(existingCashback.steps)
          ? { steps: toJson(cashbackSteps) }
          : {}),
      })
      .eq("id", existingCashback.id);
    if (updateError)
      throw new Error(`Falha ao configurar a automação de cashback: ${updateError.message}`);
    automationsUpdated++;
  } else {
    const { error: insertError } = await supabaseAdmin.from("whatsapp_automations").insert({
      ...cashbackCommon,
      steps: toJson(cashbackSteps),
      ativo: false,
    });
    if (insertError)
      throw new Error(`Falha ao criar a automação de cashback: ${insertError.message}`);
    automationsCreated++;
  }

  return {
    automationsCreated,
    automationsUpdated,
    segmentsCreated: segments.created,
  };
}

async function submitMetaTemplates() {
  const { createTemplate, listMetaTemplates } = await import("./whatsapp-meta.server");
  const listed = await listMetaTemplates();
  if (!listed.success) {
    return {
      submitted: 0,
      existing: 0,
      failures: [{ name: "conexão Meta", error: listed.error }],
      templates: [] as Array<{ name: string; status: string }>,
    };
  }

  const listedTemplates = listed.templates as Array<{
    name: string;
    language: string;
    status: string;
  }>;
  const existingByName = new Map<string, { name: string; language: string; status: string }>(
    listedTemplates.map((template) => [
      `${template.name.toLowerCase()}:${template.language}`,
      template,
    ]),
  );
  const templates: Array<{ name: string; status: string }> = [];
  const failures: Array<{ name: string; error: string }> = [];
  let submitted = 0;
  let existing = 0;

  for (const definition of LIFECYCLE_TEMPLATE_DEFINITIONS) {
    const current = existingByName.get(`${definition.name.toLowerCase()}:${definition.language}`);
    if (current) {
      existing++;
      templates.push({ name: definition.name, status: current.status });
      continue;
    }
    const result = await createTemplate({
      name: definition.name,
      category: definition.category,
      language: definition.language,
      components: definition.components,
    });
    if (result.success) {
      submitted++;
      templates.push({ name: definition.name, status: result.status });
    } else {
      failures.push({ name: definition.name, error: result.error });
    }
  }

  return { submitted, existing, failures, templates };
}

/** Instala uma vez e pode ser reexecutado com segurança: não duplica réguas nem templates. */
export async function installLifecycleAutomationBundle() {
  const automation = await installAutomationDrafts();
  const meta = await submitMetaTemplates();
  return {
    success: meta.failures.length === 0,
    ...automation,
    meta,
    automationsPaused: true,
  };
}

export async function validateLifecycleAutomationTemplates(automation: {
  automation_kind?: string | null;
  steps?: unknown;
}): Promise<{ ready: true } | { ready: false; error: string }> {
  if (automation.automation_kind !== "rfm" && automation.automation_kind !== "cashback") {
    return { ready: true };
  }
  const templateNames = Array.isArray(automation.steps)
    ? automation.steps
        .filter(
          (step): step is Record<string, unknown> => Boolean(step) && typeof step === "object",
        )
        .filter((step) => step["type"] === "send")
        .map((step) => String(step["templateName"] ?? "").trim())
    : [];
  if (templateNames.length === 0 || templateNames.some((name) => !name)) {
    return {
      ready: false,
      error: "A régua ainda não tem todos os modelos de mensagem configurados.",
    };
  }

  const { listMetaTemplates } = await import("./whatsapp-meta.server");
  const result = await listMetaTemplates();
  if (!result.success) return { ready: false, error: result.error };
  const resultTemplates = result.templates as Array<{
    name: string;
    language: string;
    status: string;
  }>;
  const approved = new Set(
    resultTemplates
      .filter(
        (template) =>
          template.language === "pt_BR" && String(template.status).toUpperCase() === "APPROVED",
      )
      .map((template) => template.name.toLowerCase()),
  );
  const pending = [...new Set(templateNames.filter((name) => !approved.has(name.toLowerCase())))];
  if (pending.length > 0) {
    return {
      ready: false,
      error: `Aguarde a aprovação da Meta para: ${pending.join(", ")}. A régua continua pausada.`,
    };
  }
  return { ready: true };
}
