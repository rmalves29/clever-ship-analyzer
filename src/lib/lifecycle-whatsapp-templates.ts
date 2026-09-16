import type { RFMSegment } from "./crm-rfm-shared";

type BodyComponent = {
  type: "BODY";
  text: string;
  example: { body_text: string[][] };
};

type FooterComponent = { type: "FOOTER"; text: string };
type ButtonsComponent = {
  type: "BUTTONS";
  buttons: Array<{ type: "URL"; text: string; url: string }>;
};

export type LifecycleTemplateDefinition = {
  name: string;
  category: "MARKETING";
  language: "pt_BR";
  components: [BodyComponent, FooterComponent, ButtonsComponent];
  bodyParams: string[];
  bodyParamTokens: string[];
};

const STORE_URL = "https://maniadmulher.com";

function marketingTemplate(
  name: string,
  text: string,
  examples: string[],
  bodyParams: string[],
): LifecycleTemplateDefinition {
  return {
    name,
    category: "MARKETING",
    language: "pt_BR",
    components: [
      { type: "BODY", text, example: { body_text: [examples] } },
      { type: "FOOTER", text: "Mania de Mulher" },
      { type: "BUTTONS", buttons: [{ type: "URL", text: "Ver a loja", url: STORE_URL }] },
    ],
    bodyParams,
    bodyParamTokens: bodyParams.map((_, index) => String(index + 1)),
  };
}

const rfmVipInvite = marketingTemplate(
  "mm_rfm_vip_convite_v1",
  "Oi, {{1}}! Você faz parte das nossas clientes mais especiais 💜 Separamos novidades da Mania de Mulher que combinam com o seu estilo. Quer ver antes de todo mundo?",
  ["Mariana"],
  ["{{NOME_CLIENTE}}"],
);

const rfmVipReminder = marketingTemplate(
  "mm_rfm_vip_reforco_v1",
  "{{1}}, passando para não deixar você perder as novidades que selecionamos com carinho. Quando quiser renovar o look, estamos por aqui 💜",
  ["Mariana"],
  ["{{NOME_CLIENTE}}"],
);

const rfmGrowthInvite = marketingTemplate(
  "mm_rfm_crescimento_convite_v1",
  "Oi, {{1}}! Adoramos ter você com a Mania de Mulher 💜 Preparamos uma seleção para inspirar seu próximo look. Vem conferir?",
  ["Mariana"],
  ["{{NOME_CLIENTE}}"],
);

const rfmGrowthReminder = marketingTemplate(
  "mm_rfm_crescimento_reforco_v1",
  "{{1}}, já viu as novidades da Mania de Mulher? Tem peças que podem combinar muito com suas últimas escolhas 💜",
  ["Mariana"],
  ["{{NOME_CLIENTE}}"],
);

const rfmAttentionInvite = marketingTemplate(
  "mm_rfm_atencao_convite_v1",
  "Oi, {{1}}! Faz um tempinho que a gente não se fala. Chegaram novidades na Mania de Mulher e pensamos em você 💜 Quer dar uma olhada?",
  ["Mariana"],
  ["{{NOME_CLIENTE}}"],
);

const rfmAttentionReminder = marketingTemplate(
  "mm_rfm_atencao_reforco_v1",
  "{{1}}, passando para lembrar que sempre tem novidade esperando por você na Mania de Mulher. Vem descobrir seu próximo look 💜",
  ["Mariana"],
  ["{{NOME_CLIENTE}}"],
);

const rfmRiskInvite = marketingTemplate(
  "mm_rfm_risco_convite_v1",
  "Oi, {{1}}! Sentimos sua falta por aqui 💜 A Mania de Mulher está com novidades e adoraríamos te ver novamente. Posso te mostrar?",
  ["Mariana"],
  ["{{NOME_CLIENTE}}"],
);

const rfmRiskReminder = marketingTemplate(
  "mm_rfm_risco_reforco_v1",
  "{{1}}, este é um lembrete carinhoso: sua próxima peça favorita pode estar esperando por você na Mania de Mulher. Vem conferir as novidades?",
  ["Mariana"],
  ["{{NOME_CLIENTE}}"],
);

const rfmReactivationInvite = marketingTemplate(
  "mm_rfm_reativacao_convite_v1",
  "Oi, {{1}}! Faz tempo desde sua última visita, mas você continua fazendo parte da nossa história 💜 Que tal conhecer o que mudou na Mania de Mulher?",
  ["Mariana"],
  ["{{NOME_CLIENTE}}"],
);

const rfmReactivationReminder = marketingTemplate(
  "mm_rfm_reativacao_reforco_v1",
  "{{1}}, passando uma última vez para te convidar a voltar. Quando fizer sentido para você, a Mania de Mulher estará de portas abertas 💜",
  ["Mariana"],
  ["{{NOME_CLIENTE}}"],
);

export const CASHBACK_RELEASED_TEMPLATE = marketingTemplate(
  "mm_cashback_liberado_v1",
  "Oi, {{1}}! Seu cashback de {{2}} já está liberado 💜 Use o código {{3}} em uma compra a partir de {{4}}, até {{5}}.",
  ["Mariana", "R$ 25,00", "CASHBACK25", "R$ 100,00", "30/09/2026"],
  [
    "{{NOME_CLIENTE}}",
    "{{VALOR_CASHBACK}}",
    "{{CUPOM_CASHBACK}}",
    "{{COMPRA_MINIMA_CASHBACK}}",
    "{{VALIDADE_CASHBACK}}",
  ],
);

export const CASHBACK_REMINDER_TEMPLATE = marketingTemplate(
  "mm_cashback_lembrete_v1",
  "Oi, {{1}}! Seu cashback de {{2}} expira {{5}}. Use o código {{3}} em compras a partir de {{4}}, até {{6}} 💜",
  ["Mariana", "R$ 25,00", "CASHBACK25", "R$ 100,00", "em 3 dias", "30/09/2026"],
  [
    "{{NOME_CLIENTE}}",
    "{{VALOR_CASHBACK}}",
    "{{CUPOM_CASHBACK}}",
    "{{COMPRA_MINIMA_CASHBACK}}",
    "{{DIAS_PARA_EXPIRAR}}",
    "{{VALIDADE_CASHBACK}}",
  ],
);

export const CASHBACK_FINAL_TEMPLATE = marketingTemplate(
  "mm_cashback_ultimo_dia_v1",
  "Oi, {{1}}! Últimas horas para usar seu cashback de {{2}} 💜 Aplique o código {{3}} em compras a partir de {{4}}, até {{5}}.",
  ["Mariana", "R$ 25,00", "CASHBACK25", "R$ 100,00", "30/09/2026"],
  [
    "{{NOME_CLIENTE}}",
    "{{VALOR_CASHBACK}}",
    "{{CUPOM_CASHBACK}}",
    "{{COMPRA_MINIMA_CASHBACK}}",
    "{{VALIDADE_CASHBACK}}",
  ],
);

const RFM_TEMPLATE_PAIRS = {
  vip: [rfmVipInvite, rfmVipReminder],
  growth: [rfmGrowthInvite, rfmGrowthReminder],
  attention: [rfmAttentionInvite, rfmAttentionReminder],
  risk: [rfmRiskInvite, rfmRiskReminder],
  reactivation: [rfmReactivationInvite, rfmReactivationReminder],
} as const;

const RFM_TEMPLATE_GROUP_BY_SEGMENT: Record<
  Exclude<RFMSegment, "Sem compra">,
  keyof typeof RFM_TEMPLATE_PAIRS
> = {
  Campeões: "vip",
  Leais: "vip",
  "Potencialmente Leais": "growth",
  Novos: "growth",
  "Precisa de atenção": "attention",
  "Quase hibernando": "attention",
  "Em risco": "risk",
  "Não pode perder": "risk",
  Hibernando: "reactivation",
  Perdidos: "reactivation",
};

export function rfmTemplatesForSegment(
  segment: Exclude<RFMSegment, "Sem compra">,
): readonly [LifecycleTemplateDefinition, LifecycleTemplateDefinition] {
  return RFM_TEMPLATE_PAIRS[RFM_TEMPLATE_GROUP_BY_SEGMENT[segment]];
}

export const LIFECYCLE_TEMPLATE_DEFINITIONS: LifecycleTemplateDefinition[] = [
  rfmVipInvite,
  rfmVipReminder,
  rfmGrowthInvite,
  rfmGrowthReminder,
  rfmAttentionInvite,
  rfmAttentionReminder,
  rfmRiskInvite,
  rfmRiskReminder,
  rfmReactivationInvite,
  rfmReactivationReminder,
  CASHBACK_RELEASED_TEMPLATE,
  CASHBACK_REMINDER_TEMPLATE,
  CASHBACK_FINAL_TEMPLATE,
];
