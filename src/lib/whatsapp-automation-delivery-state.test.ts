import { describe, expect, it } from "vitest";
import { automationDeliveryAction } from "./whatsapp-automation-delivery-state";

describe("whatsapp automation delivery state", () => {
  it("avança somente depois de envio confirmado", () => {
    expect(automationDeliveryAction("sent")).toBe("advance");
  });

  it("mantém a etapa aguardando enquanto houver retry", () => {
    expect(automationDeliveryAction("retry")).toBe("wait");
  });

  it("encerra a execução como falha após erro definitivo", () => {
    expect(automationDeliveryAction("failed")).toBe("fail");
  });
});
