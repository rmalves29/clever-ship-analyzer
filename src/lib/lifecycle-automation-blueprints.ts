import type { RFMSegment } from "./crm-rfm-shared";
import type { CashbackSendSchedule } from "./cashback-automation-schedule";

export type LifecycleSendStepBlueprint = {
  id: string;
  type: "send";
  waitMinutes: number;
  waitValue?: number;
  waitUnit?: "minutes" | "days";
  templateName: string;
  templateLanguage: string;
  messageType: "marketing" | "utility";
  bodyParams: string[];
  bodyParamTokens: string[];
  couponCode: null;
  schedule?: CashbackSendSchedule;
  nextStepId: string | null;
};

export type RFMAutomationBlueprint = {
  segment: Exclude<RFMSegment, "Sem compra">;
  slug: string;
  description: string;
  firstWaitDays: number;
  secondWaitDays: number;
};

/**
 * Todos os segmentos compradores da matriz. "Sem compra" fica fora de proposito:
 * e um publico de captacao, nao um comportamento RFM calculavel.
 */
export const RFM_AUTOMATION_BLUEPRINTS: RFMAutomationBlueprint[] = [
  {
    segment: "Campeões",
    slug: "campeoes",
    description: "Relacionamento VIP: acesso antecipado e benefício exclusivo.",
    firstWaitDays: 7,
    secondWaitDays: 23,
  },
  {
    segment: "Leais",
    slug: "leais",
    description: "Fidelização: novidades relevantes e incentivo de recorrência.",
    firstWaitDays: 7,
    secondWaitDays: 14,
  },
  {
    segment: "Potencialmente Leais",
    slug: "potencialmente-leais",
    description: "Conduz a terceira compra com cross-sell e benefício progressivo.",
    firstWaitDays: 2,
    secondWaitDays: 5,
  },
  {
    segment: "Novos",
    slug: "novos",
    description: "Pós-compra e incentivo para a segunda compra.",
    firstWaitDays: 1,
    secondWaitDays: 4,
  },
  {
    segment: "Precisa de atenção",
    slug: "precisa-atencao",
    description: "Lembrete de retorno antes de o relacionamento esfriar.",
    firstWaitDays: 0,
    secondWaitDays: 3,
  },
  {
    segment: "Quase hibernando",
    slug: "quase-hibernando",
    description: "Reativação leve para clientes de baixa frequência.",
    firstWaitDays: 0,
    secondWaitDays: 7,
  },
  {
    segment: "Em risco",
    slug: "em-risco",
    description: "Recuperação prioritária de clientes que já compravam com frequência.",
    firstWaitDays: 0,
    secondWaitDays: 3,
  },
  {
    segment: "Hibernando",
    slug: "hibernando",
    description: "Campanha de reconquista com motivo forte para voltar.",
    firstWaitDays: 0,
    secondWaitDays: 7,
  },
  {
    segment: "Não pode perder",
    slug: "nao-pode-perder",
    description: "Resgate VIP rápido para clientes historicamente valiosos.",
    firstWaitDays: 0,
    secondWaitDays: 2,
  },
  {
    segment: "Perdidos",
    slug: "perdidos",
    description: "Última tentativa de reativação, com reforço posterior.",
    firstWaitDays: 0,
    secondWaitDays: 7,
  },
];

function emptySendStep(
  id: string,
  nextStepId: string | null,
  options: { waitDays?: number; schedule?: CashbackSendSchedule },
): LifecycleSendStepBlueprint {
  const waitDays = options.waitDays ?? 0;
  return {
    id,
    type: "send",
    waitMinutes: waitDays * 1440,
    waitValue: waitDays,
    waitUnit: "days",
    templateName: "",
    templateLanguage: "pt_BR",
    messageType: "marketing",
    bodyParams: [],
    bodyParamTokens: [],
    couponCode: null,
    ...(options.schedule ? { schedule: options.schedule } : {}),
    nextStepId,
  };
}

export function buildRFMAutomationSteps(
  blueprint: RFMAutomationBlueprint,
): LifecycleSendStepBlueprint[] {
  const firstId = `rfm-${blueprint.slug}-1`;
  const secondId = `rfm-${blueprint.slug}-2`;
  return [
    emptySendStep(firstId, secondId, { waitDays: blueprint.firstWaitDays }),
    emptySendStep(secondId, null, { waitDays: blueprint.secondWaitDays }),
  ];
}

export const CASHBACK_AUTOMATION_NAME = "Cashback — lembretes até expirar";

export function buildCashbackAutomationSteps(): LifecycleSendStepBlueprint[] {
  return [
    emptySendStep("cashback-liberado", "cashback-7d", {
      schedule: { anchor: "cashback_starts_at", offsetMinutes: 0 },
    }),
    emptySendStep("cashback-7d", "cashback-3d", {
      schedule: { anchor: "cashback_ends_at", offsetMinutes: -7 * 1440 },
    }),
    emptySendStep("cashback-3d", "cashback-1d", {
      schedule: { anchor: "cashback_ends_at", offsetMinutes: -3 * 1440 },
    }),
    emptySendStep("cashback-1d", "cashback-final", {
      schedule: { anchor: "cashback_ends_at", offsetMinutes: -1440 },
    }),
    emptySendStep("cashback-final", null, {
      schedule: { anchor: "cashback_ends_at", offsetMinutes: -180 },
    }),
  ];
}
