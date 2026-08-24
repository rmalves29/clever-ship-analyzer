export type CRMFilterKind = "string" | "number" | "date" | "boolean" | "status" | "profile" | "rfm";

export type CRMFilterField = {
  id: string;
  label: string;
  kind: CRMFilterKind;
  description?: string;
};

export type CRMFilterCategory = {
  id: "pessoais" | "comportamento" | "tags" | "rfm";
  label: string;
  fields: CRMFilterField[];
};

/**
 * Catálogo do editor de segmentos.
 *
 * Regra: só entra aqui um filtro que já possui implementação real no motor
 * `matchesSegmentCondition` e cobertura de teste. Filtros futuros não devem
 * aparecer na UI antes da implementação backend.
 */
export const CRM_FILTER_CATEGORIES: CRMFilterCategory[] = [
  {
    id: "pessoais",
    label: "Dados Pessoais",
    fields: [
      { id: "cidade", label: "Cidade", kind: "string" },
      { id: "estado", label: "Estado", kind: "string" },
    ],
  },
  {
    id: "comportamento",
    label: "Comportamento de Compra",
    fields: [
      { id: "total_gasto", label: "Gasto Total em Compras Válidas", kind: "number" },
      { id: "total_pedidos", label: "Total de Pedidos Válidos", kind: "number" },
      { id: "ultima_compra", label: "Data da Última Compra Válida", kind: "date" },
      { id: "primeira_compra", label: "Data da Primeira Compra Válida", kind: "date" },
      { id: "ticket_medio", label: "Ticket Médio de Compras Válidas", kind: "number" },
      { id: "recorrencia", label: "Quantidade de Compras Válidas", kind: "number" },
      { id: "status_pagamento", label: "Status do Pagamento", kind: "status", description: "Permite auditoria de estados históricos. Paid/Partially Paid só contam se o pedido não estiver cancelado." },
      { id: "perfil", label: "Perfil do Cliente", kind: "profile" },
      { id: "data_pedido_hoje", label: "Compra Válida Realizada Hoje", kind: "boolean" },
      { id: "data_pedido_24h", label: "Compra Válida nas Últimas 24h", kind: "boolean" },
      { id: "data_envio_hoje", label: "Pedido Válido Enviado Hoje", kind: "boolean" },
      { id: "checkout_abandonado", label: "Checkout Abandonado (CAR24)", kind: "boolean" },
      { id: "acesso_sem_compra", label: "Acessou e Não Comprou", kind: "boolean" },
    ],
  },
  {
    id: "tags",
    label: "Tags",
    fields: [
      { id: "customer_tag", label: "Tag do Cliente", kind: "string" },
      { id: "tags_custom", label: "Tag Personalizada (Sistema)", kind: "string" },
    ],
  },
  {
    id: "rfm",
    label: "Análise RFM",
    fields: [
      { id: "rfm_segment", label: "Segmento RFM", kind: "rfm" },
    ],
  },
];

export const CRM_FILTER_FIELDS = CRM_FILTER_CATEGORIES.flatMap((category) => category.fields);
export const SUPPORTED_SEGMENT_FIELD_IDS = CRM_FILTER_FIELDS.map((field) => field.id);

export function getCRMFilterField(fieldId: string): CRMFilterField | undefined {
  return CRM_FILTER_FIELDS.find((field) => field.id === fieldId);
}

export function isSupportedCRMFilter(fieldId: string): boolean {
  return SUPPORTED_SEGMENT_FIELD_IDS.includes(fieldId);
}
