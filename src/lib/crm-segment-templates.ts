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

/**
 * Modelos intencionalmente prontos para uso: não possuem placeholders vazios.
 * Cross-sell específico continua sendo montado pelo editor porque depende da
 * categoria/coleção/produto real escolhido pelo usuário.
 */
export const CRM_SEGMENT_TEMPLATES: CRMSegmentTemplate[] = [
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
    id: "vip-leais",
    name: "Clientes VIP / Leais",
    description: "Clientes atualmente classificados como VIP/Leal pela matriz RFM.",
    conditions: [{ field: "rfm_segment", operator: "eq", value: "VIP/Leal" }],
  },
  {
    id: "recorrentes-recentes",
    name: "Recorrentes recentes · 30 dias",
    description: "Clientes recorrentes com compra válida nos últimos 30 dias.",
    conditions: [
      { field: "recorrencia", operator: "eq", value: "sim" },
      { field: "ultima_compra", operator: "last_days", value: 30 },
    ],
  },
  {
    id: "clientes-esfriando",
    name: "Clientes esfriando · 60+ dias",
    description: "Clientes que já compraram, mas estão há mais de 60 dias sem uma compra válida.",
    conditions: [
      { field: "total_pedidos", operator: "gte", value: 1 },
      { field: "ultima_compra", operator: "older_than_days", value: 60 },
    ],
  },
  {
    id: "alta-frequencia-60d",
    name: "Alta frequência · 3+ em 60 dias",
    description: "Clientes com pelo menos três compras válidas nos últimos 60 dias.",
    conditions: [{ field: "pedidos_periodo", operator: "gte", value: { days: 60, amount: 3 } }],
  },
  {
    id: "alto-valor-90d",
    name: "Alto valor · R$500+ em 90 dias",
    description: "Clientes que gastaram pelo menos R$500 em compras válidas nos últimos 90 dias.",
    conditions: [{ field: "gasto_periodo", operator: "gte", value: { days: 90, amount: 500 } }],
  },
  {
    id: "novos-7d",
    name: "Novos compradores · 7 dias",
    description: "Clientes com exatamente uma compra válida realizada nos últimos 7 dias.",
    conditions: [
      { field: "total_pedidos", operator: "eq", value: 1 },
      { field: "ultima_compra", operator: "last_days", value: 7 },
    ],
  },
];
