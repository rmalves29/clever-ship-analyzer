import { describe, expect, it } from "vitest";
import {
  buildAutomationContextKey,
  formatAutomationPurchasedItems,
  resolveAutomationBodyParams,
  type AutomationEventContext,
} from "./whatsapp-automation-context";

const context: AutomationEventContext = {
  capturedAt: "2026-08-25T12:00:00.000Z",
  order: {
    id: "order-1001",
    orderNumber: "#1001",
    totalPrice: 199.9,
    financialStatus: "PAID",
    fulfillmentStatus: "fulfilled",
    discountCode: "VIP10",
    shippingTitle: "SEDEX",
  },
  items: [
    { title: "Colar Gota", variantTitle: "Dourado", quantity: 1 },
    { title: "Brinco Londres", quantity: 2 },
  ],
  fulfillment: {
    trackingNumber: "BR123",
    trackingUrl: "https://rastreio.exemplo/BR123",
    status: "fulfilled",
  },
  checkout: { id: "checkout-1", checkoutUrl: "https://checkout.exemplo/1", totalPrice: 199.9 },
};

describe("whatsapp automation frozen context", () => {
  it("prioriza o pedido como chave estável do evento", () => {
    expect(buildAutomationContextKey(context, "customer-1")).toBe("order:order-1001");
  });

  it("usa checkout como chave quando não existe pedido", () => {
    expect(buildAutomationContextKey({ capturedAt: context.capturedAt, checkout: context.checkout ?? null }, "customer-1")).toBe(
      "checkout:checkout-1",
    );
  });

  it("formata itens sem depender do estado atual do pedido", () => {
    expect(formatAutomationPurchasedItems(context.items)).toBe("1x Colar Gota (Dourado), 2x Brinco Londres");
  });

  it("resolve todas as variáveis a partir do snapshot congelado", () => {
    expect(
      resolveAutomationBodyParams(
        [
          "Oi {{NOME_CLIENTE}}",
          "Pedido {{NUMERO_PEDIDO}} - {{VALOR_TOTAL}}",
          "{{ITENS_COMPRADOS}} | {{CUPOM_DESCONTO}} | {{FRETE_ESCOLHIDO}}",
          "{{RASTREIO}} | {{LINK_RASTREIO}} | {{STATUS_PEDIDO}} | {{LINK_CHECKOUT}}",
        ],
        context,
        { firstName: "Maria" },
      ),
    ).toEqual([
      "Oi Maria",
      "Pedido #1001 - R$ 199,90",
      "1x Colar Gota (Dourado), 2x Brinco Londres | VIP10 | SEDEX",
      "BR123 | https://rastreio.exemplo/BR123 | Enviado | https://checkout.exemplo/1",
    ]);
  });
});
