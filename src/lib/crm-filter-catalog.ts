import { RFM_SEGMENTS_CONFIG } from "./crm-rfm-shared";

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

export const CRM_FILTER_OPERATORS: Record<CRMFilterKind, readonly string[]> = {
  string: ["eq", "neq", "contains", "not_contains", "starts_with"],
  number: ["gt", "gte", "lt", "lte", "eq", "neq"],
  date: ["before", "after", "last_days", "on", "eq"],
  boolean: ["eq", "neq"],
  status: ["eq", "neq"],
  profile: ["eq", "neq"],
  rfm: ["eq", "neq"],
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
      { id: "data_pedido_24h", label: "Compra Válida nas Últimas 24h", kind: "boolean" },
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

function isNonBlankString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidDateOnly(value: unknown): boolean {
  if (!isNonBlankString(value)) return false;
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
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
    if (!Number.isFinite(Number(value))) return `Valor numérico inválido para ${field.label}.`;
    return null;
  }
  if (field.kind === "date") {
    if (operator === "last_days") {
      const days = Number(value);
      if (!Number.isFinite(days) || days < 0) return `Número de dias inválido para ${field.label}.`;
      return null;
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
    return Object.prototype.hasOwnProperty.call(RFM_SEGMENTS_CONFIG, String(value ?? ""))
      ? null
      : `Segmento RFM inválido.`;
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
