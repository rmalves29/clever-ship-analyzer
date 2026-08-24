import { RFM_SEGMENTS_CONFIG } from "./crm-rfm-shared";

export type CRMFilterKind =
  | "string"
  | "number"
  | "date"
  | "boolean"
  | "status"
  | "profile"
  | "rfm"
  | "product"
  | "product_date"
  | "product_number"
  | "product_money"
  | "product_sku";

export type CRMFilterField = {
  id: string;
  label: string;
  kind: CRMFilterKind;
  description?: string;
};

export type CRMFilterCategory = {
  id: "pessoais" | "comportamento" | "produtos" | "tags" | "rfm";
  label: string;
  fields: CRMFilterField[];
};

export const CRM_FILTER_OPERATORS: Record<CRMFilterKind, readonly string[]> = {
  string: ["eq", "neq", "contains", "not_contains", "starts_with"],
  number: ["gt", "gte", "lt", "lte", "eq", "neq", "between"],
  date: ["before", "after", "last_days", "older_than_days", "between_days", "on", "eq"],
  boolean: ["eq", "neq"],
  status: ["eq", "neq"],
  profile: ["eq", "neq"],
  rfm: ["eq", "neq", "in", "not_in"],
  product: ["bought", "not_bought"],
  product_date: ["last_days", "older_than_days", "between_days"],
  product_number: ["gt", "gte", "lt", "lte", "eq", "neq", "between"],
  product_money: ["gt", "gte", "lt", "lte", "eq", "neq", "between"],
  product_sku: ["bought", "not_bought"],
};

export const CRM_STATUS_FILTER_VALUES = [
  "paid",
  "partially_paid",
  "pending",
  "authorized",
  "refunded",
  "partially_refunded",
  "voided",
  "expired",
  "unpaid",
  "cancelled",
  "canceled",
] as const;

export const CRM_PROFILE_FILTER_VALUES = [
  "carrinho",
  "checkout_abandonado_ativo",
  "primeira_compra",
  "lead",
  "acesso_sem_compra",
  "sem_compra",
] as const;

export const BRAZIL_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

/**
 * Catálogo do editor de segmentos.
 *
 * Regra: só entra aqui um filtro que já possui implementação real no motor
 * de segmentação e cobertura de teste. Filtros futuros não devem aparecer
 * na UI antes da implementação backend.
 */
export const CRM_FILTER_CATEGORIES: CRMFilterCategory[] = [
  {
    id: "pessoais",
    label: "Dados Pessoais",
    fields: [
      { id: "cidade", label: "Cidade", kind: "string", description: "Comparação ignora maiúsculas, minúsculas e acentos." },
      { id: "estado", label: "Estado (UF)", kind: "string" },
    ],
  },
  {
    id: "comportamento",
    label: "Comportamento de Compra",
    fields: [
      { id: "total_gasto", label: "Gasto Total em Compras Válidas", kind: "number", description: "Permite valor mínimo, máximo ou faixa." },
      { id: "total_pedidos", label: "Total de Pedidos Válidos", kind: "number", description: "Permite quantidade mínima, máxima ou faixa." },
      { id: "ultima_compra", label: "Data da Última Compra Válida", kind: "date", description: "Pode filtrar por data, últimos dias, há mais de X dias ou intervalo de dias." },
      { id: "primeira_compra", label: "Data da Primeira Compra Válida", kind: "date", description: "Pode filtrar por data, últimos dias, há mais de X dias ou intervalo de dias." },
      { id: "ticket_medio", label: "Ticket Médio de Compras Válidas", kind: "number", description: "Permite valor mínimo, máximo ou faixa." },
      {
        id: "recorrencia",
        label: "Cliente Recorrente (2+ Compras Válidas)",
        kind: "boolean",
        description: "Sim quando o cliente possui duas ou mais compras válidas.",
      },
      {
        id: "status_pagamento",
        label: "Status do Pagamento",
        kind: "status",
        description: "Permite auditoria de estados históricos. Cancelado considera também cancelled_at, mesmo se o status financeiro ainda estiver como pago.",
      },
      { id: "perfil", label: "Perfil do Cliente", kind: "profile" },
      { id: "data_pedido_hoje", label: "Compra Válida Realizada Hoje", kind: "boolean" },
      { id: "data_pedido_24h", label: "Compra Válida nas Últimas 24h", kind: "boolean", description: "Janela móvel de 24 horas, diferente de 'Hoje'." },
      { id: "data_envio_hoje", label: "Pedido Válido Enviado Hoje", kind: "boolean" },
      {
        id: "checkout_abandonado",
        label: "Checkout Abandonado Ativo",
        kind: "boolean",
        description: "Checkout mais recente sem uma compra válida posterior.",
      },
      {
        id: "acesso_sem_compra",
        label: "Sem Compra Válida",
        kind: "boolean",
        description: "Cliente sem nenhuma compra válida. Não pressupõe que houve visita ao site.",
      },
    ],
  },
  {
    id: "produtos",
    label: "Produtos / Cross-sell",
    fields: [
      {
        id: "produto",
        label: "Produto",
        kind: "product",
        description: "Comprou ou nunca comprou um produto específico. Só considera itens de pedidos válidos.",
      },
      {
        id: "produto_periodo",
        label: "Última Compra do Produto",
        kind: "product_date",
        description: "Filtra quando o produto foi comprado pela última vez: últimos X dias, há mais de X dias ou entre X e Y dias.",
      },
      {
        id: "produto_quantidade",
        label: "Quantidade Comprada do Produto",
        kind: "product_number",
        description: "Quantidade acumulada do produto nos pedidos válidos disponíveis na base.",
      },
      {
        id: "produto_valor_gasto",
        label: "Valor Gasto no Produto",
        kind: "product_money",
        description: "Soma líquida dos itens do produto em pedidos válidos disponíveis, descontando desconto de linha quando informado.",
      },
      {
        id: "produto_sku",
        label: "SKU / Variação Comprada",
        kind: "product_sku",
        description: "Comprou ou não comprou um SKU específico daquele produto, considerando apenas pedidos válidos.",
      },
    ],
  },
  {
    id: "tags",
    label: "Tags",
    fields: [
      { id: "customer_tag", label: "Tag do Cliente", kind: "string", description: "Sugere tags existentes na base, mas continua aceitando texto livre." },
      { id: "tags_custom", label: "Tag Personalizada (Sistema)", kind: "string", description: "Sugere tags personalizadas existentes na base." },
    ],
  },
  {
    id: "rfm",
    label: "Análise RFM",
    fields: [
      { id: "rfm_segment", label: "Segmento RFM", kind: "rfm", description: "Permite selecionar um ou vários segmentos RFM." },
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

function isNonBlankString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isBlankValue(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function isValidDateOnly(value: unknown): boolean {
  if (!isNonBlankString(value)) return false;
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

function parseRange(value: unknown): { min: number; max: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as { min?: unknown; max?: unknown };
  if (isBlankValue(raw.min) || isBlankValue(raw.max)) return null;
  const min = Number(raw.min);
  const max = Number(raw.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return null;
  return { min, max };
}

type ProductFilterObject = {
  productId?: unknown;
  amount?: unknown;
  min?: unknown;
  max?: unknown;
  days?: unknown;
  sku?: unknown;
};

function parseProductObject(value: unknown): ProductFilterObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as ProductFilterObject;
  return isNonBlankString(raw.productId) ? raw : null;
}

function validateProductNumeric(fieldLabel: string, operator: string, value: unknown): string | null {
  const raw = parseProductObject(value);
  if (!raw) return `Selecione um produto para ${fieldLabel}.`;
  if (operator === "between") {
    const range = parseRange(raw);
    return range && range.min >= 0 ? null : `Faixa inválida para ${fieldLabel}.`;
  }
  if (isBlankValue(raw.amount) || !Number.isFinite(Number(raw.amount)) || Number(raw.amount) < 0) {
    return `Valor numérico inválido para ${fieldLabel}.`;
  }
  return null;
}

export function validateCRMFilterCondition(condition: unknown): string | null {
  if (!condition || typeof condition !== "object") return "Condição inválida.";
  const raw = condition as { field?: unknown; operator?: unknown; value?: unknown };
  const fieldId = String(raw.field ?? "");
  const field = getCRMFilterField(fieldId);
  if (!field) return `Filtro sem suporte: ${fieldId || "sem campo"}.`;

  const operator = String(raw.operator ?? "eq");
  if (!CRM_FILTER_OPERATORS[field.kind].includes(operator)) {
    return `Operador inválido para ${field.label}: ${operator}.`;
  }

  const value = raw.value;
  if (field.kind === "number") {
    if (operator === "between") return parseRange(value) ? null : `Faixa inválida para ${field.label}.`;
    if (isBlankValue(value) || !Number.isFinite(Number(value))) return `Valor numérico inválido para ${field.label}.`;
    return null;
  }
  if (field.kind === "date") {
    if (operator === "last_days" || operator === "older_than_days") {
      const days = Number(value);
      if (isBlankValue(value) || !Number.isFinite(days) || days < 0) return `Número de dias inválido para ${field.label}.`;
      return null;
    }
    if (operator === "between_days") {
      const range = parseRange(value);
      return range && range.min >= 0 ? null : `Intervalo de dias inválido para ${field.label}.`;
    }
    return isValidDateOnly(value) ? null : `Data inválida para ${field.label}.`;
  }
  if (field.kind === "boolean") {
    const normalized = String(value ?? "").trim().toLowerCase();
    return ["sim", "nao", "true", "false", "1", "0", "yes", "no"].includes(normalized)
      ? null
      : `Valor booleano inválido para ${field.label}.`;
  }
  if (field.kind === "status") {
    const normalized = String(value ?? "").trim().toLowerCase();
    return (CRM_STATUS_FILTER_VALUES as readonly string[]).includes(normalized)
      ? null
      : `Status inválido para ${field.label}.`;
  }
  if (field.kind === "profile") {
    const normalized = String(value ?? "").trim().toLowerCase();
    return (CRM_PROFILE_FILTER_VALUES as readonly string[]).includes(normalized)
      ? null
      : `Perfil inválido para ${field.label}.`;
  }
  if (field.kind === "rfm") {
    if (operator === "in" || operator === "not_in") {
      if (!Array.isArray(value) || value.length === 0) return "Selecione pelo menos um segmento RFM.";
      return value.every((item) => Object.prototype.hasOwnProperty.call(RFM_SEGMENTS_CONFIG, String(item)))
        ? null
        : "Segmento RFM inválido.";
    }
    return Object.prototype.hasOwnProperty.call(RFM_SEGMENTS_CONFIG, String(value ?? ""))
      ? null
      : "Segmento RFM inválido.";
  }
  if (field.kind === "product") {
    return isNonBlankString(value) ? null : "Selecione um produto.";
  }
  if (field.kind === "product_date") {
    const product = parseProductObject(value);
    if (!product) return "Selecione um produto.";
    if (operator === "between_days") {
      const range = parseRange(product);
      return range && range.min >= 0 ? null : `Intervalo de dias inválido para ${field.label}.`;
    }
    const days = Number(product.days);
    return !isBlankValue(product.days) && Number.isFinite(days) && days >= 0
      ? null
      : `Número de dias inválido para ${field.label}.`;
  }
  if (field.kind === "product_number" || field.kind === "product_money") {
    return validateProductNumeric(field.label, operator, value);
  }
  if (field.kind === "product_sku") {
    const product = parseProductObject(value);
    return product && isNonBlankString(product.sku) ? null : "Selecione um SKU/variação.";
  }
  return isNonBlankString(value) ? null : `Valor vazio para ${field.label}.`;
}

export function validateSegmentRulesPayload(rules: unknown): { valid: boolean; errors: string[] } {
  if (!rules || typeof rules !== "object") return { valid: false, errors: ["Regras do segmento são inválidas."] };
  const groups = (rules as { groups?: unknown }).groups;
  if (!Array.isArray(groups)) return { valid: false, errors: ["Regras do segmento precisam conter grupos."] };

  const errors: string[] = [];
  groups.forEach((group, groupIndex) => {
    if (!group || typeof group !== "object") {
      errors.push(`Grupo ${groupIndex + 1} inválido.`);
      return;
    }
    const conditions = (group as { conditions?: unknown }).conditions;
    if (!Array.isArray(conditions)) {
      errors.push(`Grupo ${groupIndex + 1} não possui condições válidas.`);
      return;
    }
    conditions.forEach((condition, conditionIndex) => {
      const error = validateCRMFilterCondition(condition);
      if (error) errors.push(`Grupo ${groupIndex + 1}, filtro ${conditionIndex + 1}: ${error}`);
    });
  });
  return { valid: errors.length === 0, errors };
}