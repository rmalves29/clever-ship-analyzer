import { describe, expect, it } from "vitest";
import {
  buildCashbackCode,
  buildCashbackDates,
  calculateCashback,
  calculateCashbackAmount,
  calculateMinimumPurchase,
  CASHBACK_MIN_EXPIRATION_DAYS,
  deriveCashbackStatus,
  DEFAULT_CASHBACK_SETTINGS,
  isOrderEligibleForCashback,
  normalizeExpirationDays,
  round2,
  type CashbackSettings,
} from "./cashback-shared";
import { buildAutomationTokenReplacements } from "./whatsapp-automation-context";

const settings: CashbackSettings = {
  enabled: true,
  enabled_at: "2026-01-01T00:00:00.000Z",
  percentage: 10,
  minimum_purchase_multiplier: 3,
  expiration_days: 30,
};

describe("cálculo monetário", () => {
  it("arredonda para 2 casas sem erro de ponto flutuante", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(calculateCashbackAmount(199.99, 10)).toBe(20);
    expect(calculateCashbackAmount(87.43, 7.5)).toBe(6.56);
  });

  it("calcula a compra mínima como cashback x multiplicador", () => {
    expect(calculateMinimumPurchase(20, 3)).toBe(60);
    expect(calculateMinimumPurchase(6.56, 3)).toBe(19.68);
  });

  it("nunca produz valores negativos", () => {
    expect(calculateCashbackAmount(-50, 10)).toBe(0);
    expect(calculateMinimumPurchase(-5, 3)).toBe(0);
  });
});

describe("datas e limites", () => {
  it("libera 3 dias depois e expira no dia configurado", () => {
    const { startsAt, endsAt } = buildCashbackDates("2026-03-01T12:00:00.000Z", 30);
    expect(startsAt).toBe("2026-03-04T12:00:00.000Z");
    expect(endsAt).toBe("2026-03-31T12:00:00.000Z");
  });

  it("força o mínimo de 4 dias para não vencer antes da liberação", () => {
    expect(normalizeExpirationDays(1)).toBe(CASHBACK_MIN_EXPIRATION_DAYS);
    const { startsAt, endsAt } = buildCashbackDates("2026-03-01T00:00:00.000Z", 2);
    expect(new Date(endsAt).getTime()).toBeGreaterThan(new Date(startsAt).getTime());
  });

  it("é determinístico: mesma entrada, mesmo resultado", () => {
    const a = calculateCashback(250, "2026-03-01T12:00:00.000Z", settings);
    const b = calculateCashback(250, "2026-03-01T12:00:00.000Z", settings);
    expect(a).toEqual(b);
    expect(a.cashbackAmount).toBe(25);
    expect(a.minimumPurchase).toBe(75);
  });

  it("gera código estável e legível por pedido: nº do pedido + dia/mês + primeiro nome", () => {
    const order = { orderNumber: "#1292", purchasedAt: "2026-08-29T01:50:00.000Z", customerName: "Rafael Alves" };
    const code = buildCashbackCode(order);
    expect(code).toBe(buildCashbackCode(order));
    expect(code).toBe("1292-2808-RAFAEL");
  });

  it("muda o código quando o pedido, a data ou o nome mudam", () => {
    const base = { orderNumber: "#1292", purchasedAt: "2026-08-29T01:50:00.000Z", customerName: "Rafael Alves" };
    expect(buildCashbackCode(base)).not.toBe(buildCashbackCode({ ...base, orderNumber: "#1293" }));
    expect(buildCashbackCode(base)).not.toBe(buildCashbackCode({ ...base, purchasedAt: "2026-08-30T01:50:00.000Z" }));
    expect(buildCashbackCode(base)).not.toBe(buildCashbackCode({ ...base, customerName: "Ana Souza" }));
  });

  it("usa 'CLIENTE' quando não há nome", () => {
    const code = buildCashbackCode({ orderNumber: "#1", purchasedAt: "2026-08-29T01:50:00.000Z", customerName: null });
    expect(code).toBe("1-2808-CLIENTE");
  });
});

describe("elegibilidade", () => {
  const base = {
    id: "gid://shopify/Order/1",
    financialStatus: "PAID",
    cancelledAt: null,
    customerGid: "gid://shopify/Customer/9",
    totalPrice: 200,
    purchasedAt: "2026-02-01T00:00:00.000Z",
  };
  const now = new Date("2026-02-02T00:00:00.000Z");

  it("aceita pedido pago posterior à ativação", () => {
    expect(isOrderEligibleForCashback(base, settings, now)).toEqual({ eligible: true });
  });

  it("recusa quando o recurso está desativado", () => {
    expect(isOrderEligibleForCashback(base, { ...settings, enabled: false }, now).eligible).toBe(false);
  });

  it("recusa não pago, cancelado ou sem cliente", () => {
    expect(isOrderEligibleForCashback({ ...base, financialStatus: "PENDING" }, settings, now).eligible).toBe(false);
    expect(isOrderEligibleForCashback({ ...base, cancelledAt: "2026-02-01T10:00:00Z" }, settings, now).eligible).toBe(false);
    expect(isOrderEligibleForCashback({ ...base, customerGid: null }, settings, now).eligible).toBe(false);
  });

  it("não gera cupom retroativo", () => {
    const result = isOrderEligibleForCashback({ ...base, purchasedAt: "2025-12-01T00:00:00.000Z" }, settings, now);
    expect(result).toEqual({ eligible: false, reason: "Pedido anterior à ativação do cashback." });
  });

  it("padrão de fábrica é seguro (desativado, 10%, 3x, 30 dias)", () => {
    expect(DEFAULT_CASHBACK_SETTINGS).toMatchObject({
      enabled: false,
      percentage: 10,
      minimum_purchase_multiplier: 3,
      expiration_days: 30,
    });
  });
});

describe("status derivado", () => {
  const row = { status: "pending", starts_at: "2026-03-04T00:00:00Z", ends_at: "2026-03-31T00:00:00Z" };
  it("respeita a linha do tempo", () => {
    expect(deriveCashbackStatus(row, new Date("2026-03-02T00:00:00Z"))).toBe("pending");
    expect(deriveCashbackStatus(row, new Date("2026-03-10T00:00:00Z"))).toBe("active");
    expect(deriveCashbackStatus(row, new Date("2026-04-10T00:00:00Z"))).toBe("expired");
  });
  it("mantém estados terminais de erro/cancelamento", () => {
    expect(deriveCashbackStatus({ ...row, status: "cancelled" }, new Date("2026-03-10T00:00:00Z"))).toBe("cancelled");
    expect(deriveCashbackStatus({ ...row, status: "failed" }, new Date("2026-03-10T00:00:00Z"))).toBe("failed");
  });
});

describe("tokens de cashback no contexto congelado", () => {
  it("usa o cupom do pedido congelado, não o mais recente", () => {
    const replacements = buildAutomationTokenReplacements(
      {
        capturedAt: "2026-03-01T12:00:00.000Z",
        order: { id: "1", orderNumber: "#1001", totalPrice: 250 },
        cashback: {
          code: "CASHBACKABC01",
          amount: 25,
          minimumPurchase: 75,
          startsAt: "2026-03-04T12:00:00.000Z",
          endsAt: "2026-03-31T12:00:00.000Z",
        },
      },
      { firstName: "Ana" },
    );
    expect(replacements["{{CUPOM_CASHBACK}}"]).toBe("CASHBACKABC01");
    expect(replacements["{{VALOR_CASHBACK}}"]).toContain("25,00");
    expect(replacements["{{COMPRA_MINIMA_CASHBACK}}"]).toContain("75,00");
    expect(replacements["{{VALIDADE_CASHBACK}}"]).toBe("31/03/2026");
  });

  it("cai para — quando o pedido não tem cashback", () => {
    const replacements = buildAutomationTokenReplacements(
      { capturedAt: "2026-03-01T12:00:00.000Z", order: null },
      { firstName: "Ana" },
    );
    expect(replacements["{{CUPOM_CASHBACK}}"]).toBe("—");
    expect(replacements["{{VALIDADE_CASHBACK}}"]).toBe("—");
  });
});
