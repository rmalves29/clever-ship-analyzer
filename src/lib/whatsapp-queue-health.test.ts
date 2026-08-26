import { describe, expect, it } from "vitest";
import { summarizeWhatsappQueue } from "./whatsapp-queue-health";

describe("whatsapp queue health", () => {
  it("soma estados pendentes e finalizados", () => {
    const result = summarizeWhatsappQueue([
      { status: "queued" },
      { status: "sending" },
      { status: "retry_wait" },
      { status: "sent" },
      { status: "sent" },
      { status: "failed", error: "Meta 500" },
      { status: "cancelled" },
      { status: "skipped" },
    ]);
    expect(result.total).toBe(8);
    expect(result.pending).toBe(3);
    expect(result.finished).toBe(5);
    expect(result.byStatus.sent).toBe(2);
    expect(result.successRate).toBeCloseTo(66.666, 2);
  });

  it("agrupa motivos de falha e normaliza motivo vazio", () => {
    const result = summarizeWhatsappQueue([
      { status: "failed", error: "Número inválido" },
      { status: "failed", error: "Número inválido" },
      { status: "failed", error: null },
    ]);
    expect(result.failureReasons).toEqual([
      { reason: "Número inválido", count: 2 },
      { reason: "Falha não categorizada", count: 1 },
    ]);
  });

  it("não considera status desconhecido nos totais", () => {
    const result = summarizeWhatsappQueue([{ status: "desconhecido" }]);
    expect(result.total).toBe(0);
  });
});
