import { describe, expect, it } from "vitest";
import {
  AUTOMATION_EVENTS,
  clampLookbackHours,
  defaultQuickFilter,
  describeEventTrigger,
  eventTriggerToConfig,
  eventWindow,
  isQuickFilterComplete,
  parseEventTrigger,
  quickFiltersToRules,
  type QuickFilter,
} from "./automation-events";
import { matchesSegmentRules, type CRMCustomerContext } from "./crm-segmentation-shared";

function ctx(overrides: Partial<{ tags: string[]; orders: number; spent: number }> = {}): CRMCustomerContext {
  const orders = overrides.orders ?? 0;
  return {
    customer: { id: "c1", tags: overrides.tags ?? [], tags_custom: [], city: "Belo Horizonte", province: "MG" },
    metrics: {
      customerId: "c1",
      validOrderCount: orders,
      totalSpent: overrides.spent ?? 0,
      averageTicket: orders ? (overrides.spent ?? 0) / orders : 0,
      firstOrderAt: null,
      lastOrderAt: null,
      lastPendingOrderAt: null,
      validOrderIds: new Set<string>(),
      rawFinancialStatuses: new Set<string>(),
      validFinancialStatuses: new Set<string>(),
      cancelledOrderCount: 0,
      rawFulfillmentStatuses: new Set<string>(),
    },
    purchasedProducts: new Map(),
    abandonedCheckout: false,
    hadAbandonedCheckout: false,
    abandonedCheckoutRecovered: false,
    lastAbandonedCheckoutAt: null,
    shippedToday: false,
  } as unknown as CRMCustomerContext;
}

const f = (patch: Partial<QuickFilter>): QuickFilter => ({ ...defaultQuickFilter("x"), ...patch });

describe("eventos de automação", () => {
  it("todos os eventos têm modo de reentrada coerente", () => {
    for (const e of AUTOMATION_EVENTS) {
      if (e.subject === "order") expect(e.reentryMode).toBe("per_order");
      if (e.subject === "checkout") expect(e.reentryMode).toBe("per_checkout");
      if (e.subject === "customer") expect(e.reentryMode).toBe("once");
    }
    expect(AUTOMATION_EVENTS.map((e) => e.id)).toEqual(
      expect.arrayContaining(["pedido_criado", "pedido_producao", "pedido_enviado", "pedido_entregue", "carrinho_abandonado"]),
    );
  });

  it("lê e grava trigger_config sem perder nada", () => {
    const trigger = parseEventTrigger({
      event: "pedido_enviado",
      lookbackHours: 48,
      quickFilters: [
        { id: "a", field: "tag_cliente", operator: "eq", value: "vip" },
        { id: "b", field: "campo_inexistente", operator: "eq", value: "x" },
        { id: "c", field: "total_pedidos", operator: "contains", value: "3" },
      ],
    });
    expect(trigger?.event).toBe("pedido_enviado");
    expect(trigger?.lookbackHours).toBe(48);
    expect(trigger?.filters).toHaveLength(1);
    const config = eventTriggerToConfig(trigger);
    expect(parseEventTrigger(config)).toEqual(trigger);
  });

  it("automação por segmento (sem evento) não vira gatilho de evento", () => {
    expect(parseEventTrigger({})).toBeNull();
    expect(parseEventTrigger({ event: "nao_existe" })).toBeNull();
    expect(parseEventTrigger(null)).toBeNull();
    expect(eventTriggerToConfig(null)).toEqual({ event: null, lookbackHours: null, quickFilters: null });
  });

  it("limita a janela de eventos", () => {
    expect(clampLookbackHours(0)).toBe(24);
    expect(clampLookbackHours("abc")).toBe(24);
    expect(clampLookbackHours(5000)).toBe(720);
    expect(clampLookbackHours(6)).toBe(6);
    const now = new Date("2026-10-12T12:00:00Z");
    expect(eventWindow(now, 24).from.toISOString()).toBe("2026-10-11T12:00:00.000Z");
  });

  it("filtro incompleto é ignorado e sem filtros não restringe", () => {
    expect(quickFiltersToRules([])).toBeNull();
    expect(quickFiltersToRules([f({ field: "tag_cliente", value: "  " })])).toBeNull();
    expect(isQuickFilterComplete(f({ field: "ja_comprou" }))).toBe(true);
    expect(isQuickFilterComplete(f({ field: "total_pedidos", operator: "gte", value: "abc" }))).toBe(false);
  });

  it("tag: tem / não tem", () => {
    const has = quickFiltersToRules([f({ field: "tag_cliente", operator: "eq", value: "VIP" })]);
    const not = quickFiltersToRules([f({ field: "tag_cliente", operator: "neq", value: "vip" })]);
    expect(matchesSegmentRules(ctx({ tags: ["vip"] }), has)).toBe(true);
    expect(matchesSegmentRules(ctx({ tags: [] }), has)).toBe(false);
    expect(matchesSegmentRules(ctx({ tags: ["vip"] }), not)).toBe(false);
    expect(matchesSegmentRules(ctx({ tags: [] }), not)).toBe(true);
  });

  it("já comprou? sim/não", () => {
    const bought = quickFiltersToRules([f({ field: "ja_comprou", operator: "eq" })]);
    const never = quickFiltersToRules([f({ field: "ja_comprou", operator: "neq" })]);
    expect(matchesSegmentRules(ctx({ orders: 2 }), bought)).toBe(true);
    expect(matchesSegmentRules(ctx({ orders: 0 }), bought)).toBe(false);
    expect(matchesSegmentRules(ctx({ orders: 0 }), never)).toBe(true);
    expect(matchesSegmentRules(ctx({ orders: 2 }), never)).toBe(false);
  });

  it("número: pedidos e gasto, todos precisam bater", () => {
    const rules = quickFiltersToRules([
      f({ id: "1", field: "total_pedidos", operator: "gte", value: "2" }),
      f({ id: "2", field: "total_gasto", operator: "gte", value: "300,50" }),
    ]);
    expect(matchesSegmentRules(ctx({ orders: 2, spent: 400 }), rules)).toBe(true);
    expect(matchesSegmentRules(ctx({ orders: 1, spent: 400 }), rules)).toBe(false);
    expect(matchesSegmentRules(ctx({ orders: 3, spent: 100 }), rules)).toBe(false);
  });

  it("localização", () => {
    const rules = quickFiltersToRules([f({ field: "estado", operator: "eq", value: "mg" })]);
    expect(matchesSegmentRules(ctx(), rules)).toBe(true);
    const other = quickFiltersToRules([f({ field: "cidade", operator: "neq", value: "Belo Horizonte" })]);
    expect(matchesSegmentRules(ctx(), other)).toBe(false);
  });

  it("descreve o gatilho em português", () => {
    const text = describeEventTrigger({
      event: "pedido_entregue",
      lookbackHours: 24,
      filters: [f({ field: "ja_comprou", operator: "eq" }), f({ id: "y", field: "tag_cliente", operator: "eq", value: "vip" })],
    });
    expect(text).toContain("Pedido entregue");
    expect(text).toContain("Já comprou? sim");
    expect(text).toContain("Tag do cliente tem a tag vip");
  });
});
