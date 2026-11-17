import { describe, expect, it } from "vitest";
import {
  addToTotals,
  affiliateLink,
  affiliateShortLink,
  classifyAffiliateOrder,
  emptyTotals,
  isValidAffiliateCode,
  phoneKey,
  pickAffiliateCode,
  safeRedirectPath,
  type AffiliateIdentity,
  type AffiliateOrderInput,
  type AffiliateProgramRules,
} from "./affiliate-commission";

const affiliate: AffiliateIdentity = { commissionPct: 15, whatsapp: "(31) 99999-1111", email: "ana@exemplo.com" };
const rules: AffiliateProgramRules = { holdDays: 10, windowStart: null, windowEnd: null };
const NOW = new Date("2026-11-30T12:00:00Z");

function order(overrides: Partial<AffiliateOrderInput> = {}): AffiliateOrderInput {
  return {
    orderId: "o1",
    createdAt: "2026-11-27T15:00:00Z",
    financialStatus: "PAID",
    cancelledAt: null,
    subtotal: 200,
    customerEmail: "cliente@exemplo.com",
    customerPhone: "5511988887777",
    ...overrides,
  };
}

describe("classifyAffiliateOrder", () => {
  it("calcula 15% sobre os produtos e deixa em carência até cumprir os dias", () => {
    expect(classifyAffiliateOrder(order(), affiliate, rules, false, NOW)).toEqual({ status: "pending", base: 200, commission: 30, needsReview: false });
  });

  it("vira aprovada quando a carência passou", () => {
    const later = new Date("2026-12-08T12:00:00Z");
    expect(classifyAffiliateOrder(order(), affiliate, rules, false, later).status).toBe("approved");
  });

  it("arredonda para centavos", () => {
    const c = classifyAffiliateOrder(order({ subtotal: 33.33 }), affiliate, rules, false, NOW);
    expect(c.commission).toBe(5);
    expect(classifyAffiliateOrder(order({ subtotal: 10.07 }), { ...affiliate, commissionPct: 15 }, rules, false, NOW).commission).toBe(1.51);
  });

  it("cancelado, estornado ou expirado não gera comissão", () => {
    for (const financialStatus of ["VOIDED", "REFUNDED", "EXPIRED"]) {
      expect(classifyAffiliateOrder(order({ financialStatus }), affiliate, rules, false, NOW)).toMatchObject({ status: "void", commission: 0 });
    }
    expect(classifyAffiliateOrder(order({ cancelledAt: "2026-11-28T10:00:00Z" }), affiliate, rules, false, NOW).status).toBe("void");
  });

  it("pedido ainda não pago fica aguardando", () => {
    expect(classifyAffiliateOrder(order({ financialStatus: "PENDING" }), affiliate, rules, false, NOW)).toMatchObject({ status: "unpaid", commission: 0 });
  });

  it("reembolso parcial conta, mas pede conferência", () => {
    expect(classifyAffiliateOrder(order({ financialStatus: "PARTIALLY_REFUNDED" }), affiliate, rules, false, NOW)).toMatchObject({ status: "pending", needsReview: true });
  });

  it("respeita a janela de datas do programa", () => {
    const windowed: AffiliateProgramRules = { holdDays: 0, windowStart: "2026-11-27T03:00:00Z", windowEnd: "2026-11-28T02:59:59Z" };
    expect(classifyAffiliateOrder(order({ createdAt: "2026-11-27T15:00:00Z" }), affiliate, windowed, false, NOW).status).toBe("approved");
    expect(classifyAffiliateOrder(order({ createdAt: "2026-11-26T15:00:00Z" }), affiliate, windowed, false, NOW)).toMatchObject({ status: "outside_window", commission: 0 });
    expect(classifyAffiliateOrder(order({ createdAt: "2026-11-28T15:00:00Z" }), affiliate, windowed, false, NOW).status).toBe("outside_window");
  });

  it("compra da própria afiliada (telefone ou e-mail) não paga comissão", () => {
    expect(classifyAffiliateOrder(order({ customerPhone: "+55 31 99999-1111" }), affiliate, rules, false, NOW).status).toBe("self_purchase");
    expect(classifyAffiliateOrder(order({ customerEmail: "ANA@exemplo.com" }), affiliate, rules, false, NOW).status).toBe("self_purchase");
  });

  it("pedido já pago continua pago, e avisa se foi estornado depois", () => {
    expect(classifyAffiliateOrder(order(), affiliate, rules, true, NOW)).toMatchObject({ status: "paid", needsReview: false, commission: 30 });
    expect(classifyAffiliateOrder(order({ financialStatus: "REFUNDED" }), affiliate, rules, true, NOW)).toMatchObject({ status: "paid", needsReview: true });
  });
});

describe("totais", () => {
  it("soma por status", () => {
    const totals = emptyTotals();
    addToTotals(totals, { status: "approved", base: 100, commission: 15, needsReview: false });
    addToTotals(totals, { status: "approved", base: 50, commission: 7.5, needsReview: false });
    addToTotals(totals, { status: "void", base: 80, commission: 0, needsReview: false });
    expect(totals.approved).toEqual({ orders: 2, commission: 22.5 });
    expect(totals.void.orders).toBe(1);
  });
});

describe("cupom exclusivo", () => {
  it("usa o primeiro nome sem acento e resolve conflito com sufixo", () => {
    expect(pickAffiliateCode("Ana Clara Souza", new Set())).toBe("ANA");
    expect(pickAffiliateCode("Ana Clara", new Set(["ana"]))).toBe("ANA10");
    expect(pickAffiliateCode("Ana", new Set(["ANA", "ANA10", "ANA11"]))).toBe("ANA12");
    expect(pickAffiliateCode("Thaís Fávero", new Set())).toBe("THAIS");
    expect(pickAffiliateCode("Jo", new Set())).toBe("JOM");
    expect(pickAffiliateCode("12 34", new Set())).toBe("MMM");
  });
  it("valida o formato do código", () => {
    expect(isValidAffiliateCode("ANA10")).toBe(true);
    expect(isValidAffiliateCode("ana10")).toBe(false);
    expect(isValidAffiliateCode("AB")).toBe(false);
    expect(isValidAffiliateCode("ANA-10")).toBe(false);
  });
  it("monta o link que aplica o cupom", () => {
    expect(affiliateLink("https://maniadmulher.com/", "ANA10", "/collections/black-friday")).toBe(
      "https://maniadmulher.com/discount/ANA10?redirect=%2Fcollections%2Fblack-friday",
    );
  });
  it("phoneKey usa os 11 últimos dígitos", () => {
    expect(phoneKey("+55 (31) 99999-1111")).toBe("31999991111");
    expect(phoneKey(null)).toBe("");
  });
});

describe("link curto", () => {
  it("monta /a/<codigo> em minúsculas e aceita um destino interno", () => {
    expect(affiliateShortLink("https://crm.maniadmulher.com/", "RAFAEL")).toBe("https://crm.maniadmulher.com/a/rafael");
    expect(affiliateShortLink("https://crm.maniadmulher.com", "ANA10", "/collections/black-friday")).toBe(
      "https://crm.maniadmulher.com/a/ana10?to=%2Fcollections%2Fblack-friday",
    );
  });
  it("só aceita caminhos internos (sem redirecionamento aberto)", () => {
    expect(safeRedirectPath("/collections/black-friday")).toBe("/collections/black-friday");
    expect(safeRedirectPath("https://evil.com")).toBe("/");
    expect(safeRedirectPath("//evil.com")).toBe("/");
    expect(safeRedirectPath("/\\evil.com")).toBe("/");
    expect(safeRedirectPath("")).toBe("/");
    expect(safeRedirectPath(null)).toBe("/");
  });
});
