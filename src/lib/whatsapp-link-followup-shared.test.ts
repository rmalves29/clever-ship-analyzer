import { describe, expect, it } from "vitest";
import { brtHour, classifyReply, isInsideSendWindow, phoneKey } from "./whatsapp-link-followup-shared";

describe("classifyReply", () => {
  it.each(["Sim", "sim.", "Confirmo", "pode sim", "Pode", "podeee", "siiiimmm", "simmm", "claro", "me manda o acesso", "boa tarde..sim", "Pode confirmar"])(
    "positiva: %s",
    (text) => expect(classifyReply(text)).toBe("positiva"),
  );
  it.each(["Cancelar", "Não", "nao", "Não obrigada", "sair", "Não quero", "por favor descadastrar meu número", "me tira dessa lista de transmissão por favor?", "número foi alterado"])(
    "negativa: %s",
    (text) => expect(classifyReply(text)).toBe("negativa"),
  );
  it.each(["ok", "OK!", "Boa tarde ok", "ok, estou aguardando a black friday .."])("ok: %s", (text) => expect(classifyReply(text)).toBe("ok"));
  it.each(["Oi", "Boa tarde", "obrigada", "", "olá, a félix da silva advocacia agradece seu contato. como podemos ajudar?", "tem como ver pra mim por favor?"])(
    "outra: %s",
    (text) => expect(classifyReply(text)).toBe("outra"),
  );
  it("mensagem automática longa de outra empresa NÃO vira positiva", () => {
    expect(classifyReply("Olá! 🌷 Que alegria receber sua mensagem. Obrigada pelo contato! Para agilizar o atendimento, por favor me envie seu nome e você pode aguardar.")).toBe("outra");
    expect(classifyReply("Olá, tudo bem? Meu nome é Anna, sou psicóloga clínica e estou à sua disposição. Quero entender como posso ajudar.")).toBe("outra");
  });
  it("pedido de trocar o número vai para fora da lista", () => {
    expect(classifyReply("Boa tarde. Sou o esposo da Dilcilene. Você pode mudar o Celular para o dela?")).toBe("negativa");
  });
  it("pedido de sair continua valendo mesmo em mensagem longa", () => {
    expect(classifyReply("Agradeço, mas tenho pavor de grupos kkk então prefiro que não me adicione em nenhum, por favor")).toBe("negativa");
  });
  it("respostas humanas de tamanho normal continuam positivas", () => {
    expect(classifyReply("Ola boa tarde. Sim quero participar do grupo sim")).toBe("positiva");
    expect(classifyReply("Boa tarde, pode liberar sim por favor")).toBe("positiva");
  });
  it("negativa ganha de positiva", () => {
    expect(classifyReply("sim, mas quero sair da lista")).toBe("negativa");
  });
  it("aceita nulo", () => {
    expect(classifyReply(null)).toBe("outra");
  });
});

describe("horário de envio (Brasília)", () => {
  // Brasília = UTC-3
  const at = (hhmmBrt: string) => new Date(`2026-11-02T${hhmmBrt}:00-03:00`);
  it("manda das 08:00 até 19:59", () => {
    expect(isInsideSendWindow(at("08:00"))).toBe(true);
    expect(isInsideSendWindow(at("13:20"))).toBe(true);
    expect(isInsideSendWindow(at("19:40"))).toBe(true);
    expect(isInsideSendWindow(at("19:59"))).toBe(true);
  });
  it("não manda às 20:00 nem de madrugada; só acumula", () => {
    expect(isInsideSendWindow(at("20:00"))).toBe(false);
    expect(isInsideSendWindow(at("23:40"))).toBe(false);
    expect(isInsideSendWindow(at("00:00"))).toBe(false);
    expect(isInsideSendWindow(at("07:59"))).toBe(false);
  });
  it("usa a hora de Brasília, não a do servidor (UTC)", () => {
    expect(brtHour(new Date("2026-11-02T11:00:00Z"))).toBe(8);
    expect(brtHour(new Date("2026-11-03T02:59:00Z"))).toBe(23);
  });
});

describe("phoneKey", () => {
  it("casa número com e sem o 9º dígito", () => {
    expect(phoneKey("5531988887777")).toBe(phoneKey("553188887777"));
    expect(phoneKey("+55 (31) 98888-7777")).toBe(phoneKey("553188887777"));
  });
  it("DDD diferente não casa", () => {
    expect(phoneKey("5511988887777")).not.toBe(phoneKey("5531988887777"));
  });
});
