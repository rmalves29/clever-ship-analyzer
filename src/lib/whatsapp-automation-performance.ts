import {
  formatCashbackScheduleLabel,
  parseCashbackSendSchedule,
} from "./cashback-automation-schedule";

export type AutomationPerformanceMetrics = {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  orders: number;
  revenue: number;
  cost: number;
  roas: number | null;
};

export type AutomationPerformanceStep = AutomationPerformanceMetrics & {
  stepId: string;
  order: number;
  label: string;
  templateName: string;
  messageType: "marketing" | "utility";
};

export type AutomationPerformanceRow = AutomationPerformanceMetrics & {
  automationId: string;
  name: string;
  description: string | null;
  active: boolean;
  automationKind: string;
  steps: AutomationPerformanceStep[];
};

export type AutomationPerformanceReport = {
  totals: AutomationPerformanceMetrics;
  automations: AutomationPerformanceRow[];
  attributionWindowDays: number;
  generatedAt: string;
};

export type AutomationDefinitionPerformanceInput = {
  id: string;
  name: string;
  description?: string | null;
  active?: boolean;
  automationKind?: string | null;
  steps?: unknown;
};

export type AutomationCampaignPerformanceInput = {
  id: string;
  name: string;
  automationId: string;
  automationStepId?: string | null;
  templateName?: string | null;
  messageType?: string | null;
  sent?: number | null;
  delivered?: number | null;
  read?: number | null;
  failed?: number | null;
};

export type AutomationCampaignRevenueInput = {
  revenue: number;
  orders: number;
};

type SendStep = {
  id: string;
  type: "send";
  waitMinutes: number;
  waitValue?: number;
  waitUnit?: "minutes" | "days";
  templateName?: string;
  messageType?: "marketing" | "utility";
  schedule?: unknown;
};

const EMPTY_METRICS: Omit<AutomationPerformanceMetrics, "roas"> = {
  sent: 0,
  delivered: 0,
  read: 0,
  failed: 0,
  orders: 0,
  revenue: 0,
  cost: 0,
};

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function metricsWithRoas(
  metrics: Omit<AutomationPerformanceMetrics, "roas">,
): AutomationPerformanceMetrics {
  const cost = roundMoney(metrics.cost);
  const revenue = roundMoney(metrics.revenue);
  return {
    ...metrics,
    cost,
    revenue,
    roas: cost > 0 ? Number((revenue / cost).toFixed(2)) : null,
  };
}

function addMetrics(
  target: Omit<AutomationPerformanceMetrics, "roas">,
  source: Omit<AutomationPerformanceMetrics, "roas">,
): void {
  target.sent += source.sent;
  target.delivered += source.delivered;
  target.read += source.read;
  target.failed += source.failed;
  target.orders += source.orders;
  target.revenue += source.revenue;
  target.cost += source.cost;
}

function sendSteps(raw: unknown): SendStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const step = value as Record<string, unknown>;
    if (step["type"] !== "send" || !String(step["id"] ?? "").trim()) return [];
    const messageType = step["messageType"] === "utility" ? "utility" : "marketing";
    return [
      {
        id: String(step["id"]),
        type: "send" as const,
        waitMinutes: Math.max(0, number(step["waitMinutes"])),
        ...(typeof step["waitValue"] === "number" ? { waitValue: step["waitValue"] } : {}),
        ...(step["waitUnit"] === "days" || step["waitUnit"] === "minutes"
          ? { waitUnit: step["waitUnit"] }
          : {}),
        templateName: String(step["templateName"] ?? ""),
        messageType,
        schedule: step["schedule"],
      },
    ];
  });
}

function durationLabel(step: SendStep): string {
  const value =
    step.waitValue ?? (step.waitUnit === "days" ? step.waitMinutes / 1440 : step.waitMinutes);
  const unit =
    step.waitUnit ?? (step.waitMinutes > 0 && step.waitMinutes % 1440 === 0 ? "days" : "minutes");
  const rounded = Math.max(0, Math.round(value));
  if (rounded === 0) return "imediatamente";
  if (unit === "days") return rounded === 1 ? "1 dia" : `${rounded} dias`;
  if (rounded % 60 === 0) {
    const hours = rounded / 60;
    return hours === 1 ? "1 hora" : `${hours} horas`;
  }
  return rounded === 1 ? "1 minuto" : `${rounded} minutos`;
}

export function automationStepTimingLabel(step: SendStep, index: number): string {
  const cashbackSchedule = parseCashbackSendSchedule(step.schedule);
  if (cashbackSchedule) return formatCashbackScheduleLabel(cashbackSchedule);
  const duration = durationLabel(step);
  if (duration === "imediatamente")
    return index === 0 ? "Ao entrar na automação" : "Após a etapa anterior";
  return index === 0 ? `${duration} após o gatilho` : `${duration} após a etapa anterior`;
}

/**
 * Consolida somente campanhas ligadas a uma automação. Cada campanha do motor representa uma
 * etapa; por isso a soma por `automation_id + automation_step_id` mantém campanhas manuais fora
 * do relatório e permite abrir o resultado etapa por etapa.
 */
export function buildAutomationPerformanceReport(params: {
  definitions: AutomationDefinitionPerformanceInput[];
  campaigns: AutomationCampaignPerformanceInput[];
  revenueByCampaign?: Map<string, AutomationCampaignRevenueInput>;
  costPerMessage: { marketing: number; utility: number };
  attributionWindowDays: number;
  generatedAt?: string;
}): AutomationPerformanceReport {
  const revenueByCampaign = params.revenueByCampaign ?? new Map();
  const definitionsById = new Map(
    params.definitions.map((definition) => [definition.id, definition]),
  );
  const campaignsByAutomation = new Map<string, AutomationCampaignPerformanceInput[]>();
  for (const campaign of params.campaigns) {
    if (!campaign.automationId) continue;
    const list = campaignsByAutomation.get(campaign.automationId) ?? [];
    list.push(campaign);
    campaignsByAutomation.set(campaign.automationId, list);
  }

  const orderedAutomationIds = [
    ...params.definitions.map((definition) => definition.id),
    ...Array.from(campaignsByAutomation.keys()).filter((id) => !definitionsById.has(id)),
  ];

  const automations = orderedAutomationIds.map((automationId): AutomationPerformanceRow => {
    const definition = definitionsById.get(automationId);
    const automationCampaigns = campaignsByAutomation.get(automationId) ?? [];
    const configuredSteps = sendSteps(definition?.steps);
    const campaignStepIds = automationCampaigns.map(
      (campaign) => campaign.automationStepId || "sem-etapa",
    );
    const allStepIds = Array.from(
      new Set([
        ...configuredSteps.map((step) => step.id),
        ...campaignStepIds.filter((id) => !configuredSteps.some((step) => step.id === id)),
      ]),
    );

    const steps = allStepIds.map((stepId, index): AutomationPerformanceStep => {
      const configured = configuredSteps.find((step) => step.id === stepId);
      const linkedCampaigns = automationCampaigns.filter(
        (campaign) => (campaign.automationStepId || "sem-etapa") === stepId,
      );
      const metrics = { ...EMPTY_METRICS };
      for (const campaign of linkedCampaigns) {
        const messageType = campaign.messageType === "utility" ? "utility" : "marketing";
        const sent = number(campaign.sent);
        const revenue = revenueByCampaign.get(campaign.id);
        addMetrics(metrics, {
          sent,
          delivered: number(campaign.delivered),
          read: number(campaign.read),
          failed: number(campaign.failed),
          orders: number(revenue?.orders),
          revenue: number(revenue?.revenue),
          cost: sent * params.costPerMessage[messageType],
        });
      }
      const fallbackCampaign = linkedCampaigns[0];
      return {
        stepId,
        order: index + 1,
        label: configured
          ? automationStepTimingLabel(configured, index)
          : stepId === "sem-etapa"
            ? "Envios históricos sem etapa identificada"
            : `Etapa ${index + 1}`,
        templateName: configured?.templateName || fallbackCampaign?.templateName || "—",
        messageType:
          configured?.messageType ??
          (fallbackCampaign?.messageType === "utility" ? "utility" : "marketing"),
        ...metricsWithRoas(metrics),
      };
    });

    const total = { ...EMPTY_METRICS };
    for (const step of steps) addMetrics(total, step);
    return {
      automationId,
      name: definition?.name ?? automationCampaigns[0]?.name ?? "Automação removida",
      description: definition?.description ?? null,
      active: Boolean(definition?.active),
      automationKind: definition?.automationKind ?? "historical",
      steps,
      ...metricsWithRoas(total),
    };
  });

  const totals = { ...EMPTY_METRICS };
  for (const automation of automations) addMetrics(totals, automation);

  return {
    totals: metricsWithRoas(totals),
    automations,
    attributionWindowDays: params.attributionWindowDays,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
  };
}
