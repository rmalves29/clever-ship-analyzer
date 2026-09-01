import { describe, expect, it } from "vitest";
import { findFirstTouchCampaign, WHATSAPP_ATTRIBUTION_WINDOW_DAYS } from "./whatsapp-attribution";

const orderAt = "2026-08-31T15:00:00.000Z";

describe("atribuição de receita das campanhas", () => {
  it("usa uma janela padrão de três dias", () => {
    expect(WHATSAPP_ATTRIBUTION_WINDOW_DAYS).toBe(3);
  });

  it("atribui à primeira campanha enviada dentro das 72 horas", () => {
    expect(
      findFirstTouchCampaign({
        orderPhone: "5511999999999",
        orderAt,
        deliveries: [
          {
            campaignId: "campanha-b",
            phone: "5511999999999",
            status: "sent",
            sentAt: "2026-08-31T12:00:00.000Z",
          },
          {
            campaignId: "campanha-a",
            phone: "5511999999999",
            status: "read",
            sentAt: "2026-08-29T12:00:00.000Z",
          },
        ],
      }),
    ).toBe("campanha-a");
  });

  it("ignora mensagens posteriores, falhas e envios fora da janela", () => {
    expect(
      findFirstTouchCampaign({
        orderPhone: "5511999999999",
        orderAt,
        deliveries: [
          {
            campaignId: "antiga",
            phone: "5511999999999",
            status: "sent",
            sentAt: "2026-08-27T14:59:59.000Z",
          },
          {
            campaignId: "falhou",
            phone: "5511999999999",
            status: "failed",
            sentAt: "2026-08-30T12:00:00.000Z",
          },
          {
            campaignId: "depois",
            phone: "5511999999999",
            status: "sent",
            sentAt: "2026-08-31T16:00:00.000Z",
          },
        ],
      }),
    ).toBeNull();
  });

  it("não mistura clientes diferentes", () => {
    expect(
      findFirstTouchCampaign({
        orderPhone: "5511888888888",
        orderAt,
        deliveries: [
          {
            campaignId: "outro-cliente",
            phone: "5511999999999",
            status: "sent",
            sentAt: "2026-08-30T12:00:00.000Z",
          },
        ],
      }),
    ).toBeNull();
  });

  it("encontra a primeira campanha usando qualquer telefone válido do pedido", () => {
    expect(
      findFirstTouchCampaign({
        orderPhones: ["+5531996800731", "+5511999999999"],
        orderAt,
        deliveries: [
          {
            campaignId: "mais-recente",
            phone: "+5511999999999",
            status: "read",
            sentAt: "2026-08-31T12:00:00.000Z",
          },
          {
            campaignId: "primeira",
            phone: "+5531996800731",
            status: "sent",
            sentAt: "2026-08-29T12:00:00.000Z",
          },
        ],
      }),
    ).toBe("primeira");
  });
});
