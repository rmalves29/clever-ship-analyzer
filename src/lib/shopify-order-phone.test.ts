import { describe, expect, it } from "vitest";
import {
  extractShopifyOrderPhones,
  getPrimaryShopifyOrderPhone,
  normalizeShopifyPhone,
} from "./shopify-order-phone";

describe("telefones dos pedidos da Shopify", () => {
  it("normaliza telefone brasileiro para E.164", () => {
    expect(normalizeShopifyPhone("(31) 99680-0731")).toBe("+5531996800731");
    expect(normalizeShopifyPhone("+55 31 99680-0731")).toBe("+5531996800731");
  });

  it("prioriza o telefone do endereço de entrega", () => {
    expect(
      getPrimaryShopifyOrderPhone({
        phone: null,
        shippingAddress: { phone: "+55 31 99680-0731" },
        customer: { phone: "+55 11 99999-9999" },
      }),
    ).toBe("+5531996800731");
  });

  it("reúne cadastro, endereços e telefone persistido sem duplicar", () => {
    expect(
      extractShopifyOrderPhones(
        {
          customer: {
            phone: "11999999999",
            defaultAddress: { phone: "+55 21 98888-8888" },
            addresses: [{ phone: "+55 31 97777-7777" }],
          },
        },
        "+55 11 99999-9999",
      ),
    ).toEqual(["+5511999999999", "+5521988888888", "+5531977777777"]);
  });

  it("mantém compatibilidade com snapshots REST antigos", () => {
    expect(getPrimaryShopifyOrderPhone({ shipping_address: { phone: "31996800731" } })).toBe(
      "+5531996800731",
    );
  });
});
