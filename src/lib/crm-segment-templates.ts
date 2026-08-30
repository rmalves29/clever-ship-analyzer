import { CRM_FILTER_CATEGORIES, getCRMFilterField } from "./crm-filter-catalog";
import { RFM_SEGMENTS_CONFIG, type RFMSegment } from "./crm-rfm-shared";

export type CRMSegmentTemplateCondition = {
  field: string;
  operator: string;
  value: unknown;
};

export type CRMSegmentTemplate = {
  id: string;
  name: string;
  description: string;
  conditions: CRMSegmentTemplateCondition[];
};

export type PersistedCRMSegmentRules = {
  groups: Array<{
    id: string;
    type: "AND";
    conditions: Array<{
      id: string;
      category: string;
      field: string;
      operator: string;
      value: unknown;
      label: string;
    }>;
  }>;
};

const CRM_RFM_TEMPLATE_IDS: Record<RFMSegment, string> = {
  "Sem compra": "rfm-sem-compra",
  Campeões: "rfm-campeoes",
  Leais: "rfm-leais",
  "Potencialmente Leais": "rfm-potencialmente-leais",
  Novos: "rfm-novos",
  "Precisa de atenção": "rfm-precisa-atencao",
  "Quase hibernando": "rfm-quase-hibernando",
  "Em risco": "rfm-em-risco",
  Hibernando: "rfm-hibernando",
  "Não pode perder": "rfm-nao-pode-perder",
  Perdidos: "rfm-perdidos",
};

/**
 * Um modelo dinâmico para cada classificação da matriz RFM.
 * A audiência não é congelada: o resolvedor do CRM lê o rfm_segment atual
 * do cliente sempre que exibe, exporta ou envia uma campanha.
 */
export const CRM_RFM_SEGMENT_TEMPLATES: CRMSegmentTemplate[] = (
  Object.entries(RFM_SEGMENTS_CONFIG) as Array<
    [RFMSegment, (typeof RFM_SEGMENTS_CONFIG)[RFMSegment]]
  >
).map(([segment, config]) => ({
  id: CRM_RFM_TEMPLATE_IDS[segment],
  name: `RFM — ${segment}`,
  description: `Segmento RFM dinâmico. ${config.description} A composição é atualizada automaticamente após cada recálculo da RFM.`,
  conditions: [{ field: "rfm_segment", operator: "eq", value: segment }],
}));

/**
 * Modelos intencionalmente prontos para uso: não possuem placeholders vazios.
 * Cross-sell específico continua sendo montado pelo editor porque depende da
 * categoria/coleção/produto real escolhido pelo usuário.
 *
 * A ordem prioriza segmentos com maior potencial comercial imediato: abandono,
 * 2ª compra, recorrência, frequência, valor, fidelização e reativação.
 */
export const CRM_SEGMENT_TEMPLATES: CRMSegmentTemplate[] = [
  {
    id: "checkout-abandonado-ativo",
    name: "Checkout abandonado ativo",
    description: "Clientes com checkout abandonado ativo e sem uma compra válida posterior. Público de recuperação com alta intenção.",
    conditions: [{ field: "checkout_abandonado", operator: "eq", value: "sim" }],
  },
  {
    id: "segunda-compra-8-14",
    name: "2ª compra pendente · 8–14 dias",
    description: "Clientes com exatamente uma compra válida feita entre 8 e 14 dias atrás. Boa janela para incentivar a primeira recompra.",
    conditions: [
      { field: "total_pedidos", operator: "eq", value: 1 },
      { field: "ultima_compra", operator: "between_days", value: { min: 8, max: 14 } },
    ],
  },
  {
    id: "segunda-compra-15-30",
    name: "2ª compra pendente · 15–30 dias",
    description: "Clientes com exatamente uma compra válida cuja última compra ocorreu entre 15 e 30 dias atrás.",
    conditions: [
      { field: "total_pedidos", operator: "eq", value: 1 },
      { field: "ultima_compra", operator: "between_days", value: { min: 15, max: 30 } },
    ],
  },
  {
    id: "novos-7d",
    name: "Novos compradores · 7 dias",
    description: "Clientes com exatamente uma compra válida realizada nos últimos 7 dias. Útil para onboarding e preparação da 2ª compra.",
    conditions: [
      { field: "total_pedidos", operator: "eq", value: 1 },
      { field: "ultima_compra", operator: "last_days", value: 7 },
    ],
  },
  {
    id: "recorrentes-recentes",
    name: "Recorrentes recentes · 30 dias",
    description: "Clientes recorrentes com compra válida nos últimos 30 dias. Público quente para novidades, kits e lançamentos.",
    conditions: [
      { field: "recorrencia", operator: "eq", value: "sim" },
      { field: "ultima_compra", operator: "last_days", value: 30 },
    ],
  },
  {
    id: "frequencia-2-30d",
    name: "Frequência alta · 2+ em 30 dias",
    description: "Clientes com pelo menos duas compras válidas nos últimos 30 dias. Indica forte propensão de recompra no curto prazo.",
    conditions: [{ field: "pedidos_periodo", operator: "gte", value: { days: 30, amount: 2 } }],
  },
  {
    id: "alta-frequencia-60d",
    name: "Alta frequência · 3+ em 60 dias",
    description: "Clientes com pelo menos três compras válidas nos últimos 60 dias.",
    conditions: [{ field: "pedidos_periodo", operator: "gte", value: { days: 60, amount: 3 } }],
  },
  {
    id: "alto-valor-30d",
    name: "Alto valor · R$300+ em 30 dias",
    description: "Clientes que gastaram pelo menos R$300 em compras válidas nos últimos 30 dias. Bom público para ofertas premium e lançamentos.",
    conditions: [{ field: "gasto_periodo", operator: "gte", value: { days: 30, amount: 300 } }],
  },
  {
    id: "alto-valor-90d",
    name: "Alto valor · R$500+ em 90 dias",
    description: "Clientes que gastaram pelo menos R$500 em compras válidas nos últimos 90 dias.",
    conditions: [{ field: "gasto_periodo", operator: "gte", value: { days: 90, amount: 500 } }],
  },
  {
    id: "compra-unica-alto-valor",
    name: "1 compra de alto valor · R$300+",
    description: "Clientes que compraram apenas uma vez, mas já gastaram R$300 ou mais. Prioridade para transformar uma boa primeira compra em recorrência.",
    conditions: [
      { field: "total_pedidos", operator: "eq", value: 1 },
      { field: "total_gasto", operator: "gte", value: 300 },
    ],
  },
  {
    id: "ticket-alto-recente",
    name: "Ticket alto + compra recente",
    description: "Clientes com ticket médio de R$300 ou mais e compra válida nos últimos 30 dias. Público indicado para produtos de maior valor.",
    conditions: [
      { field: "ticket_medio", operator: "gte", value: 300 },
      { field: "ultima_compra", operator: "last_days", value: 30 },
    ],
  },
  {
    id: "recorrente-alto-valor",
    name: "Recorrentes de alto valor",
    description: "Clientes recorrentes, com R$500 ou mais em gasto válido acumulado e compra nos últimos 30 dias. Público comercial prioritário.",
    conditions: [
      { field: "recorrencia", operator: "eq", value: "sim" },
      { field: "total_gasto", operator: "gte", value: 500 },
      { field: "ultima_compra", operator: "last_days", value: 30 },
    ],
  },
  ...CRM_RFM_SEGMENT_TEMPLATES,
  {
    id: "baixo-ticket-recente",
    name: "Ticket abaixo de R$150 + recente",
    description: "Clientes com ticket médio abaixo de R$150 e compra nos últimos 30 dias. Útil para testar kits, progressivos e aumento de ticket.",
    conditions: [
      { field: "ticket_medio", operator: "lt", value: 150 },
      { field: "ultima_compra", operator: "last_days", value: 30 },
    ],
  },
  {
    id: "clientes-esfriando",
    name: "Clientes esfriando · 60+ dias",
    description: "Clientes que já compraram, mas estão há mais de 60 dias sem uma compra válida. Público de reativação.",
    conditions: [
      { field: "total_pedidos", operator: "gte", value: 1 },
      { field: "ultima_compra", operator: "older_than_days", value: 60 },
    ],
  },
];

/**
 * Converte um modelo comercial para exatamente o mesmo formato persistido pelo editor.
 * Isso permite criar os modelos em lote no banco sem salvar regras incompletas que depois
 * não poderiam ser editadas/removidas corretamente na interface.
 */
export function buildPersistedRulesFromTemplate(template: CRMSegmentTemplate): PersistedCRMSegmentRules {
  const conditions = template.conditions.map((condition, index) => {
    const field = getCRMFilterField(condition.field);
    if (!field) throw new Error(`Filtro sem suporte no modelo ${template.name}: ${condition.field}`);
    const category = CRM_FILTER_CATEGORIES.find((item) => item.fields.some((candidate) => candidate.id === field.id));
    if (!category) throw new Error(`Categoria não encontrada para ${field.label}.`);

    return {
      id: `template-${template.id}-${index + 1}`,
      category: category.id,
      field: condition.field,
      operator: condition.operator,
      value: JSON.parse(JSON.stringify(condition.value)),
      label: field.label,
    };
  });

  return {
    groups: [{
      id: `template-${template.id}`,
      type: "AND",
      conditions,
    }],
  };
}
