/**
 * Gatilhos por evento de pedido/carrinho para automações + filtros rápidos de cliente.
 * Parte pura (sem banco): a tela e o motor usam estas definições. A busca no banco fica em
 * `automation-events.server.ts`.
 */
import type { SegmentCondition, SegmentRules } from "./crm-segmentation-shared";

export const AUTOMATION_EVENT_IDS = [
  "pedido_criado",
  "pedido_pago",
  "pedido_pendente",
  "pedido_producao",
  "pedido_enviado",
  "pedido_saiu_entrega",
  "pedido_entregue",
  "entrega_problema",
  "pedido_cancelado",
  "carrinho_abandonado",
  "cliente_cadastrado",
] as const;

export type AutomationEventId = (typeof AUTOMATION_EVENT_IDS)[number];

export type AutomationEventDef = {
  id: AutomationEventId;
  label: string;
  hint: string;
  /** Tipo de entrada que o evento gera: pedido, carrinho ou só o cliente. */
  subject: "order" | "checkout" | "customer";
  /** Modo de reentrada recomendado (um disparo por pedido/carrinho). */
  reentryMode: "per_order" | "per_checkout" | "once";
};

export const AUTOMATION_EVENTS: readonly AutomationEventDef[] = [
  { id: "pedido_criado", label: "Pedido feito", hint: "Assim que o cliente faz o pedido (pago ou não).", subject: "order", reentryMode: "per_order" },
  { id: "pedido_pago", label: "Pagamento aprovado", hint: "Quando o pedido passa a constar como pago.", subject: "order", reentryMode: "per_order" },
  { id: "pedido_pendente", label: "Pedido aguardando pagamento", hint: "Pix/boleto gerado e ainda não pago — ideal para cobrar.", subject: "order", reentryMode: "per_order" },
  { id: "pedido_producao", label: "Pedido em produção", hint: "Pago e ainda sem envio (separação/produção).", subject: "order", reentryMode: "per_order" },
  { id: "pedido_enviado", label: "Pedido enviado", hint: "Quando o código de rastreio é gerado — use a variável de rastreio na mensagem.", subject: "order", reentryMode: "per_order" },
  { id: "pedido_saiu_entrega", label: "Saiu para entrega", hint: "O pedido está com o carteiro/entregador.", subject: "order", reentryMode: "per_order" },
  { id: "pedido_entregue", label: "Pedido entregue", hint: "A transportadora confirmou a entrega. Para pesquisa 'depois de usar', coloque a espera na 1ª etapa.", subject: "order", reentryMode: "per_order" },
  { id: "entrega_problema", label: "Problema na entrega", hint: "Tentativa de entrega frustrada ou pedido não entregue.", subject: "order", reentryMode: "per_order" },
  { id: "pedido_cancelado", label: "Pedido cancelado", hint: "O pedido foi cancelado.", subject: "order", reentryMode: "per_order" },
  { id: "carrinho_abandonado", label: "Carrinho abandonado", hint: "Checkout iniciado sem compra depois. Só entra quem não comprou.", subject: "checkout", reentryMode: "per_checkout" },
  { id: "cliente_cadastrado", label: "Novo contato cadastrado", hint: "Contato novo na base (pop-up, formulário). Combine com 'Nunca comprou' para pesquisar o motivo.", subject: "customer", reentryMode: "once" },
];

export const AUTOMATION_EVENT_BY_ID: ReadonlyMap<string, AutomationEventDef> = new Map(AUTOMATION_EVENTS.map((e) => [e.id, e]));

export const DEFAULT_EVENT_LOOKBACK_HOURS = 24;
export const MAX_EVENT_LOOKBACK_HOURS = 24 * 30;
export const MAX_EVENT_AFTER_HOURS = 24 * 60;

export type QuickFilterOperator = "eq" | "neq" | "gte" | "lte" | "last_days" | "older_than_days" | "in" | "not_in" | "contains";

export type QuickFilter = {
  id: string;
  field: QuickFilterFieldId;
  operator: QuickFilterOperator;
  value: string;
};

export type EventTrigger = {
  event: AutomationEventId;
  /** Pega eventos ocorridos nas últimas N horas (quem já passou disso não entra). */
  lookbackHours: number;
  /** Só dispara N horas depois do evento — o estado (filtros, "ainda sem envio"…) é conferido nesse momento. */
  afterHours: number;
  filters: QuickFilter[];
};

export type QuickFilterKind = "tag" | "boolean" | "number" | "days" | "text" | "rfm" | "payment" | "delivery";

export type QuickFilterField = {
  id: string;
  label: string;
  kind: QuickFilterKind;
  /** Campo correspondente no motor de segmentos. */
  segmentField: string;
};

export const QUICK_FILTER_FIELDS = [
  { id: "tag_cliente", label: "Tag do cliente", kind: "tag", segmentField: "customer_tag" },
  { id: "tag_sistema", label: "Tag do sistema (personalizada)", kind: "tag", segmentField: "tags_custom" },
  { id: "ja_comprou", label: "Já comprou?", kind: "boolean", segmentField: "acesso_sem_compra" },
  { id: "total_pedidos", label: "Quantidade de pedidos", kind: "number", segmentField: "total_pedidos" },
  { id: "total_gasto", label: "Valor gasto no total (R$)", kind: "number", segmentField: "total_gasto" },
  { id: "ticket_medio", label: "Ticket médio (R$)", kind: "number", segmentField: "ticket_medio" },
  { id: "ultima_compra", label: "Última compra", kind: "days", segmentField: "ultima_compra" },
  { id: "primeira_compra", label: "Primeira compra", kind: "days", segmentField: "primeira_compra" },
  { id: "rfm", label: "Segmento RFM", kind: "rfm", segmentField: "rfm_segment" },
  { id: "status_pagamento", label: "Status do pagamento (algum pedido)", kind: "payment", segmentField: "status_pagamento" },
  { id: "status_entrega", label: "Status da entrega (algum pedido)", kind: "delivery", segmentField: "status_entrega" },
  { id: "cidade", label: "Cidade", kind: "text", segmentField: "cidade" },
  { id: "estado", label: "Estado (UF)", kind: "text", segmentField: "estado" },
  { id: "cashback", label: "Tem cashback disponível?", kind: "boolean", segmentField: "cashback_disponivel" },
  { id: "janela_24h", label: "Conversa aberta (últimas 24h)?", kind: "boolean", segmentField: "janela_24h_aberta" },
] as const satisfies readonly QuickFilterField[];

export type QuickFilterFieldId = (typeof QUICK_FILTER_FIELDS)[number]["id"];

export const QUICK_FILTER_FIELD_BY_ID: ReadonlyMap<string, QuickFilterField> = new Map(
  QUICK_FILTER_FIELDS.map((f) => [f.id, f]),
);

export const PAYMENT_STATUS_OPTIONS = [
  { value: "PAID", label: "Pago" },
  { value: "PENDING", label: "Aguardando pagamento" },
  { value: "EXPIRED", label: "Expirado" },
  { value: "VOIDED", label: "Anulado" },
  { value: "REFUNDED", label: "Reembolsado" },
  { value: "CANCELLED", label: "Cancelado" },
] as const;

export const DELIVERY_STATUS_OPTIONS = [
  { value: "FULFILLED", label: "Etiqueta gerada/enviado" },
  { value: "IN_TRANSIT", label: "Em trânsito" },
  { value: "OUT_FOR_DELIVERY", label: "Saiu para entrega" },
  { value: "DELIVERED", label: "Entregue" },
  { value: "ATTEMPTED_DELIVERY", label: "Tentativa de entrega" },
  { value: "NOT_DELIVERED", label: "Não entregue" },
] as const;

const OPERATORS_BY_KIND: Record<QuickFilterKind, Array<{ value: QuickFilterOperator; label: string }>> = {
  tag: [
    { value: "eq", label: "tem a tag" },
    { value: "neq", label: "não tem a tag" },
  ],
  boolean: [
    { value: "eq", label: "sim" },
    { value: "neq", label: "não" },
  ],
  number: [
    { value: "gte", label: "maior ou igual a" },
    { value: "lte", label: "menor ou igual a" },
    { value: "eq", label: "igual a" },
  ],
  days: [
    { value: "last_days", label: "nos últimos (dias)" },
    { value: "older_than_days", label: "há mais de (dias)" },
  ],
  text: [
    { value: "eq", label: "é" },
    { value: "neq", label: "não é" },
  ],
  rfm: [
    { value: "eq", label: "é" },
    { value: "neq", label: "não é" },
  ],
  payment: [
    { value: "eq", label: "é" },
    { value: "neq", label: "não é" },
  ],
  delivery: [
    { value: "eq", label: "é" },
    { value: "neq", label: "não é" },
  ],
};

export function quickFilterOperators(kind: QuickFilterKind) {
  return OPERATORS_BY_KIND[kind];
}

export function defaultQuickFilter(id: string, field: QuickFilterFieldId = "tag_cliente"): QuickFilter {
  const def = QUICK_FILTER_FIELD_BY_ID.get(field)!;
  return { id, field, operator: OPERATORS_BY_KIND[def.kind][0]!.value, value: def.kind === "boolean" ? "sim" : "" };
}

/** "Já comprou?" = sim  ->  NÃO é "sem compra válida". Os demais booleanos mapeiam direto. */
function booleanRuleOperator(filter: QuickFilter, def: QuickFilterField): { operator: string; value: string } {
  const wantsYes = filter.operator === "eq";
  if (def.id === "ja_comprou") {
    // acesso_sem_compra é verdadeiro quando NÃO há compra válida.
    return { operator: "eq", value: wantsYes ? "nao" : "sim" };
  }
  return { operator: "eq", value: wantsYes ? "sim" : "nao" };
}

export function isQuickFilterComplete(filter: QuickFilter): boolean {
  const def = QUICK_FILTER_FIELD_BY_ID.get(filter.field);
  if (!def) return false;
  if (def.kind === "boolean") return true;
  const value = String(filter.value ?? "").trim();
  if (!value) return false;
  if (def.kind === "number" || def.kind === "days") return Number.isFinite(Number(value.replace(",", "."))) && Number(value.replace(",", ".")) >= 0;
  return true;
}

/**
 * Converte os filtros rápidos em regras do motor de segmentos (um grupo, todos precisam bater).
 * Filtros incompletos são ignorados. Sem nenhum filtro devolve `null` (sem restrição).
 */
export function quickFiltersToRules(filters: readonly QuickFilter[] | null | undefined): SegmentRules | null {
  const conditions = (filters ?? []).flatMap((filter): SegmentCondition[] => {
    const def = QUICK_FILTER_FIELD_BY_ID.get(filter.field);
    if (!def || !isQuickFilterComplete(filter)) return [];
    if (def.kind === "boolean") {
      const { operator, value } = booleanRuleOperator(filter, def);
      return [{ field: def.segmentField, operator, value }];
    }
    if (def.kind === "number" || def.kind === "days") {
      return [{ field: def.segmentField, operator: filter.operator, value: Number(String(filter.value).replace(",", ".")) }];
    }
    return [{ field: def.segmentField, operator: filter.operator, value: String(filter.value).trim() }];
  });
  if (conditions.length === 0) return null;
  return { groups: [{ type: "AND", conditions }] };
}

export function describeQuickFilter(filter: QuickFilter): string {
  const def = QUICK_FILTER_FIELD_BY_ID.get(filter.field);
  if (!def) return "";
  const op = OPERATORS_BY_KIND[def.kind].find((o) => o.value === filter.operator)?.label ?? filter.operator;
  if (def.kind === "boolean") return `${def.label} ${op}`;
  return `${def.label} ${op} ${filter.value}`;
}

export function clampLookbackHours(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_EVENT_LOOKBACK_HOURS;
  return Math.min(n, MAX_EVENT_LOOKBACK_HOURS);
}

export function clampAfterHours(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_EVENT_AFTER_HOURS);
}

function parseQuickFilter(raw: unknown, index: number): QuickFilter | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const def = QUICK_FILTER_FIELD_BY_ID.get(String(r["field"] ?? ""));
  if (!def) return null;
  const allowed = OPERATORS_BY_KIND[def.kind].map((o) => o.value as string);
  const operator = String(r["operator"] ?? "");
  if (!allowed.includes(operator)) return null;
  return {
    id: typeof r["id"] === "string" && r["id"] ? r["id"] : `f${index}`,
    field: def.id as QuickFilterFieldId,
    operator: operator as QuickFilterOperator,
    value: String(r["value"] ?? "").slice(0, 120),
  };
}

/** Lê `trigger_config` salvo. Devolve `null` quando a automação não é por evento. */
export function parseEventTrigger(config: unknown): EventTrigger | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const c = config as Record<string, unknown>;
  const event = String(c["event"] ?? "");
  if (!AUTOMATION_EVENT_BY_ID.has(event)) return null;
  const filters = Array.isArray(c["quickFilters"])
    ? (c["quickFilters"] as unknown[]).flatMap((f, i) => {
        const parsed = parseQuickFilter(f, i);
        return parsed ? [parsed] : [];
      })
    : [];
  return {
    event: event as AutomationEventId,
    lookbackHours: clampLookbackHours(c["lookbackHours"]),
    afterHours: clampAfterHours(c["afterHours"]),
    filters,
  };
}

/** Campos a gravar em `trigger_config` (mesclados ao que já existir lá). */
export function eventTriggerToConfig(trigger: EventTrigger | null): Record<string, unknown> {
  if (!trigger) return { event: null, lookbackHours: null, afterHours: null, quickFilters: null };
  return {
    event: trigger.event,
    lookbackHours: clampLookbackHours(trigger.lookbackHours),
    afterHours: clampAfterHours(trigger.afterHours),
    quickFilters: trigger.filters.filter(isQuickFilterComplete).map((f) => ({ id: f.id, field: f.field, operator: f.operator, value: f.value })),
  };
}

/**
 * Janela de eventos que entram agora: [now - after - lookback, now - after].
 * Com `afterHours = 0` é simplesmente "as últimas N horas".
 */
export function eventWindow(now: Date, lookbackHours: number, afterHours = 0): { from: Date; to: Date } {
  const to = new Date(now.getTime() - clampAfterHours(afterHours) * 3_600_000);
  return { from: new Date(to.getTime() - clampLookbackHours(lookbackHours) * 3_600_000), to };
}

export function describeAfterHours(hours: number): string {
  const h = clampAfterHours(hours);
  if (h === 0) return "";
  if (h % 24 === 0) return `${h / 24} ${h === 24 ? "dia" : "dias"} depois`;
  return `${h}h depois`;
}

export function describeEventTrigger(trigger: EventTrigger): string {
  const def = AUTOMATION_EVENT_BY_ID.get(trigger.event);
  const filters = trigger.filters.filter(isQuickFilterComplete).map(describeQuickFilter);
  const after = describeAfterHours(trigger.afterHours);
  return `${def?.label ?? trigger.event}${after ? ` · ${after}` : ""}${filters.length ? ` · ${filters.join(" · ")}` : ""}`;
}
