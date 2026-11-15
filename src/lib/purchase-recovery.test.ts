import { describe, expect, it } from "vitest";
import {
  PURCHASE_RECOVERY_IMPLEMENTATION,
  RECOVERY_TEMPLATES,
  evaluateRecoveryGuards,
  evaluateTemplateGate,
  isWithinRecoveryWindow,
  nextRecoverySendTime,
  parseRecoveryConfig,
  phoneKey,
  phoneVariants,
  reconcileAttemptWithQueue,
  recoveryProcessingBlocker,
  reminderDueAt,
  selectAttemptsForEnrollment,
  validateRecoveryUrl,
  type AttemptCandidate,
  type MetaTemplate,
  type RecoveryGuardFacts,
} from "./purchase-recovery";

const HOSTS = ["maniadmulher.com", "www.maniadmulher.com", "azmr41-w0.myshopify.com"];
const URL_A = "https://maniadmulher.com/77747060914/checkouts/ac/aaa111";
const URL_B = "https://maniadmulher.com/77747060914/checkouts/ac/bbb222";

const candidate = (over: Partial<AttemptCandidate> = {}): AttemptCandidate => ({
  attemptKey: "checkout:1",
  source: "checkout",
  sourceId: "1",
  cohort: "continuous",
  customerId: "c1",
  email: "Ana@Example.com",
  rawPhone: "+5531992904210",
  firstName: "Ana",
  rawUrl: URL_A,
  attemptAt: "2026-11-16T13:00:00Z",
  ...over,
});

const facts = (over: Partial<RecoveryGuardFacts> = {}): RecoveryGuardFacts => ({
  source: "checkout",
  sourceId: "1",
  attemptAt: "2026-11-16T13:00:00Z",
  phoneValid: true,
  urlValid: true,
  sourceFound: true,
  sourceCompletedAt: null,
  sourceOrder: null,
  relatedOrders: [],
  lastInboundAt: null,
  suppressed: false,
  blockedTag: false,
  openBlockingRun: false,
  ...over,
});

describe("horário de Brasília (09h–19h)", () => {
  it("só envia entre 09:00 e 18:59 de Brasília", () => {
    expect(isWithinRecoveryWindow(new Date("2026-11-16T11:59:00Z"))).toBe(false); // 08:59
    expect(isWithinRecoveryWindow(new Date("2026-11-16T12:00:00Z"))).toBe(true); // 09:00
    expect(isWithinRecoveryWindow(new Date("2026-11-16T21:59:00Z"))).toBe(true); // 18:59
    expect(isWithinRecoveryWindow(new Date("2026-11-16T22:00:00Z"))).toBe(false); // 19:00
  });
  it("fora da janela aguarda o próximo horário válido", () => {
    expect(nextRecoverySendTime(new Date("2026-11-16T09:30:00Z")).toISOString()).toBe("2026-11-16T12:00:00.000Z"); // 06:30 -> 09:00
    expect(nextRecoverySendTime(new Date("2026-11-16T23:00:00Z")).toISOString()).toBe("2026-11-17T12:00:00.000Z"); // 20:00 -> amanhã 09:00
    expect(nextRecoverySendTime(new Date("2026-11-17T02:30:00Z")).toISOString()).toBe("2026-11-17T12:00:00.000Z"); // 23:30 -> 09:00
    expect(nextRecoverySendTime(new Date("2026-11-16T15:00:00Z")).toISOString()).toBe("2026-11-16T15:00:00.000Z");
  });
});

describe("lembrete: 4h após o envio CONFIRMADO", () => {
  it("conta a partir do envio, não da fila", () => {
    expect(reminderDueAt(new Date("2026-11-16T13:00:00Z")).toISOString()).toBe("2026-11-16T17:00:00.000Z"); // 10h -> 14h
  });
  it("4h que caem fora da janela vão para 09h do dia seguinte", () => {
    expect(reminderDueAt(new Date("2026-11-16T19:00:00Z")).toISOString()).toBe("2026-11-17T12:00:00.000Z"); // 16h -> 20h -> 09h
  });
  it("job ainda na fila ou sem id da Meta não agenda lembrete", () => {
    expect(reconcileAttemptWithQueue("initial", { status: "queued", sentAt: null, waMessageId: null, errorMessage: null })).toBeNull();
    expect(reconcileAttemptWithQueue("initial", { status: "sending", sentAt: null, waMessageId: null, errorMessage: null })).toBeNull();
    expect(reconcileAttemptWithQueue("initial", { status: "sent", sentAt: "2026-11-16T13:00:00Z", waMessageId: null, errorMessage: null })).toBeNull();
  });
  it("envio confirmado agenda o lembrete pelo horário real de envio", () => {
    expect(reconcileAttemptWithQueue("initial", { status: "sent", sentAt: "2026-11-16T13:05:00Z", waMessageId: "wamid.1", errorMessage: null })).toMatchObject({
      status: "waiting_reminder",
      initial_sent_at: "2026-11-16T13:05:00Z",
      reminder_due_at: "2026-11-16T17:05:00.000Z",
    });
  });
  it("lembrete enviado conclui; falha e cancelamento encerram sem novo envio", () => {
    expect(reconcileAttemptWithQueue("reminder", { status: "delivered", sentAt: "2026-11-16T17:05:00Z", waMessageId: "wamid.2", errorMessage: null })).toMatchObject({ status: "completed" });
    expect(reconcileAttemptWithQueue("initial", { status: "failed", sentAt: null, waMessageId: null, errorMessage: "131026" })).toMatchObject({ status: "failed", last_error: "131026" });
    expect(reconcileAttemptWithQueue("initial", { status: "cancelled", sentAt: null, waMessageId: null, errorMessage: "compra posterior à tentativa" })).toMatchObject({
      status: "exited",
      exit_reason: "compra posterior à tentativa",
    });
  });
});

describe("entrada no fluxo", () => {
  const now = new Date("2026-11-16T14:00:00Z");

  it("aguarda 30 minutos após a tentativa", () => {
    expect(selectAttemptsForEnrollment([candidate({ attemptAt: "2026-11-16T13:31:00Z" })], [], HOSTS, now)).toEqual([]);
    const rows = selectAttemptsForEnrollment([candidate({ attemptAt: "2026-11-16T13:30:00Z" })], [], HOSTS, now);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "pending", eligible_at: "2026-11-16T14:00:00.000Z", phone_key: "+5531992904210", email: "ana@example.com" });
  });

  it("cliente novo ou antigo entra (sem cliente cadastrado também)", () => {
    const rows = selectAttemptsForEnrollment([candidate({ customerId: null })], [], HOSTS, now);
    expect(rows[0]?.status).toBe("pending");
  });

  it("mesmo telefone (com e sem o 9): só a tentativa mais recente entra", () => {
    const rows = selectAttemptsForEnrollment(
      [
        candidate({ attemptKey: "checkout:old", sourceId: "old", attemptAt: "2026-11-16T12:00:00Z", rawPhone: "+553192904210", rawUrl: URL_B }),
        candidate({ attemptKey: "checkout:new", sourceId: "new", attemptAt: "2026-11-16T13:00:00Z" }),
      ],
      [],
      HOSTS,
      now,
    );
    expect(rows.find((r) => r.attempt_key === "checkout:new")?.status).toBe("pending");
    expect(rows.find((r) => r.attempt_key === "checkout:old")).toMatchObject({ status: "excluded", exit_reason: expect.stringContaining("duplicada") });
  });

  it("cada tentativa entra uma única vez", () => {
    const existing = [{ attemptKey: "checkout:1", phoneKey: "+5531992904210", status: "completed" as const, createdAt: "2026-11-01T00:00:00Z", recoveryUrl: URL_A }];
    expect(selectAttemptsForEnrollment([candidate()], existing, HOSTS, now)).toEqual([]);
  });

  it("não abre duas recuperações simultâneas da mesma pessoa", () => {
    const existing = [{ attemptKey: "checkout:x", phoneKey: "+5531992904210", status: "waiting_reminder" as const, createdAt: "2026-11-16T10:00:00Z", recoveryUrl: URL_B }];
    expect(selectAttemptsForEnrollment([candidate()], existing, HOSTS, now)[0]).toMatchObject({ status: "excluded", exit_reason: "pessoa já está em uma recuperação aberta" });
  });

  it("reentrada só para nova tentativa 7 dias após a última entrada", () => {
    const prev = (createdAt: string) => [{ attemptKey: "checkout:x", phoneKey: "+5531992904210", status: "completed" as const, createdAt, recoveryUrl: URL_B }];
    expect(selectAttemptsForEnrollment([candidate()], prev("2026-11-12T13:00:00Z"), HOSTS, now)[0]).toMatchObject({ status: "excluded", exit_reason: expect.stringContaining("7 dias") });
    expect(selectAttemptsForEnrollment([candidate()], prev("2026-11-09T13:00:00Z"), HOSTS, now)[0]?.status).toBe("pending");
    // Tentativa excluída antes (nunca recebeu mensagem) não conta para o bloqueio.
    const excluded = [{ ...prev("2026-11-15T13:00:00Z")[0]!, status: "excluded" as const }];
    expect(selectAttemptsForEnrollment([candidate()], excluded, HOSTS, now)[0]?.status).toBe("pending");
  });

  it("pedido expirado sem link reutilizável seguro é excluído e reportado", () => {
    const rows = selectAttemptsForEnrollment([candidate({ attemptKey: "order:9", source: "order", sourceId: "9", rawUrl: null })], [], HOSTS, now);
    expect(rows[0]).toMatchObject({ status: "excluded", exit_reason: "pedido expirado sem link reutilizável seguro" });
  });

  it("link de outro domínio, sem HTTPS, placeholder ou de outra pessoa não entra", () => {
    const one = (rawUrl: string) => selectAttemptsForEnrollment([candidate({ rawUrl })], [], HOSTS, now)[0];
    expect(one("https://golpe.com/77747060914/checkouts/ac/aaa")?.status).toBe("excluded");
    expect(one("http://maniadmulher.com/77747060914/checkouts/ac/aaa")?.status).toBe("excluded");
    expect(one("https://maniadmulher.com/{{2}}")?.status).toBe("excluded");
    expect(one("https://maniadmulher.com/exemplo")?.status).toBe("excluded");
    const otherOwner = [{ attemptKey: "checkout:z", phoneKey: "+5511988887777", status: "completed" as const, createdAt: "2026-11-01T00:00:00Z", recoveryUrl: URL_A }];
    expect(selectAttemptsForEnrollment([candidate()], otherOwner, HOSTS, now)[0]).toMatchObject({ status: "excluded", exit_reason: "link pertence a outro telefone" });
  });

  it("sem telefone válido é excluído", () => {
    expect(selectAttemptsForEnrollment([candidate({ rawPhone: "123" })], [], HOSTS, now)[0]).toMatchObject({ status: "excluded", exit_reason: "sem telefone válido" });
  });
});

describe("conferência imediatamente antes de cada envio", () => {
  it("tudo limpo: pode enviar", () => {
    expect(evaluateRecoveryGuards(facts())).toEqual({ send: true });
  });
  it("compra posterior (mesmo que feita entre a fila e o envio) cancela", () => {
    const decision = evaluateRecoveryGuards(facts({ relatedOrders: [{ id: "o1", createdAt: "2026-11-16T14:01:00Z", financialStatus: "PAID", cancelledAt: null }] }));
    expect(decision).toEqual({ send: false, reason: "compra posterior à tentativa" });
  });
  it("compra feita antes da ativação mas depois da tentativa também cancela (corte = tentativa original)", () => {
    expect(evaluateRecoveryGuards(facts({ relatedOrders: [{ id: "o1", createdAt: "2026-11-16T13:10:00Z", financialStatus: "PARTIALLY_PAID", cancelledAt: null }] })).send).toBe(false);
  });
  it("compra anterior à tentativa não impede", () => {
    expect(evaluateRecoveryGuards(facts({ relatedOrders: [{ id: "o0", createdAt: "2026-11-10T13:00:00Z", financialStatus: "PAID", cancelledAt: null }] }))).toEqual({ send: true });
  });
  it("pedido posterior PENDING/AUTHORIZED (Pix) cancela para não duplicar cobrança", () => {
    for (const status of ["PENDING", "AUTHORIZED"]) {
      expect(evaluateRecoveryGuards(facts({ relatedOrders: [{ id: "o2", createdAt: "2026-11-16T15:00:00Z", financialStatus: status, cancelledAt: null }] }))).toEqual({
        send: false,
        reason: "pedido posterior pendente/autorizado",
      });
    }
  });
  it("resposta do cliente desde a tentativa cancela", () => {
    expect(evaluateRecoveryGuards(facts({ lastInboundAt: "2026-11-16T15:00:00Z" }))).toEqual({ send: false, reason: "cliente respondeu" });
    expect(evaluateRecoveryGuards(facts({ lastInboundAt: "2026-11-15T15:00:00Z" }))).toEqual({ send: true });
  });
  it("opt-out, sem-automacao e PIX em andamento cancelam", () => {
    expect(evaluateRecoveryGuards(facts({ suppressed: true }))).toEqual({ send: false, reason: "opt-out de marketing" });
    expect(evaluateRecoveryGuards(facts({ blockedTag: true }))).toEqual({ send: false, reason: "contato marcado como sem-automacao" });
    expect(evaluateRecoveryGuards(facts({ openBlockingRun: true })).send).toBe(false);
  });
  it("tentativa recuperada, inválida ou cancelada cancela", () => {
    expect(evaluateRecoveryGuards(facts({ sourceCompletedAt: "2026-11-16T13:40:00Z" })).send).toBe(false);
    expect(evaluateRecoveryGuards(facts({ sourceFound: false })).send).toBe(false);
    expect(evaluateRecoveryGuards(facts({ urlValid: false })).send).toBe(false);
    expect(evaluateRecoveryGuards(facts({ phoneValid: false })).send).toBe(false);
    const order = { id: "9", createdAt: "2026-11-16T13:00:00Z", cancelledAt: null };
    expect(evaluateRecoveryGuards(facts({ source: "order", sourceId: "9", sourceOrder: { ...order, financialStatus: "PAID" } }))).toEqual({ send: false, reason: "compra concluída no mesmo pedido" });
    expect(evaluateRecoveryGuards(facts({ source: "order", sourceId: "9", sourceOrder: { ...order, financialStatus: "EXPIRED", cancelledAt: "2026-11-16T14:00:00Z" } }))).toEqual({ send: false, reason: "tentativa cancelada" });
  });
  it("lembrete não sai se a 1ª mensagem falhou na entrega", () => {
    expect(evaluateRecoveryGuards(facts({ previousMessageFailed: true })).send).toBe(false);
  });
});

describe("aprovação dos dois modelos na Meta", () => {
  const tpl = (stage: "initial" | "reminder", status: string, body?: string): MetaTemplate => ({
    id: stage === "initial" ? "1109574618586322" : "1064049296695373",
    name: RECOVERY_TEMPLATES[stage].name,
    language: "pt_BR",
    status,
    category: "MARKETING",
    components: [{ type: "BODY", text: body ?? RECOVERY_TEMPLATES[stage].body }],
  });
  const now = new Date("2026-11-16T14:00:00Z");

  it("só libera com os dois APPROVED e texto idêntico", () => {
    expect(evaluateTemplateGate([tpl("initial", "APPROVED"), tpl("reminder", "APPROVED")], null, now).ok).toBe(true);
  });
  it("PENDING, REJECTED, PAUSED, DISABLED ou ausente não libera", () => {
    for (const status of ["PENDING", "REJECTED", "PAUSED", "DISABLED"]) {
      const gate = evaluateTemplateGate([tpl("initial", "APPROVED"), tpl("reminder", status)], null, now);
      expect(gate.ok).toBe(false);
      expect(gate.reason).toContain(status);
    }
    expect(evaluateTemplateGate([tpl("initial", "APPROVED")], null, now)).toMatchObject({ ok: false, reminder: { status: "NAO_ENCONTRADO" } });
  });
  it("erro de API nunca libera", () => {
    expect(evaluateTemplateGate(null, "timeout", now)).toMatchObject({ ok: false, reason: expect.stringContaining("timeout") });
  });
  it("modelo aprovado com texto alterado não libera", () => {
    expect(evaluateTemplateGate([tpl("initial", "APPROVED", "Oi {{1}}, 10% OFF {{2}}"), tpl("reminder", "APPROVED")], null, now).ok).toBe(false);
  });
});

describe("trava de implementação/publicação", () => {
  const armed = parseRecoveryConfig({
    recoveryArmed: true,
    recoveryImplementation: PURCHASE_RECOVERY_IMPLEMENTATION,
    recoveryAllowedHost: "clever-ship-analyzer.lovable.app",
    recoveryContinuousSince: "2026-11-15T21:00:00Z",
  });
  it("roda só armado, na versão certa e pelo endereço publicado", () => {
    expect(recoveryProcessingBlocker(armed, "clever-ship-analyzer.lovable.app")).toBeNull();
    expect(recoveryProcessingBlocker(armed, null)).not.toBeNull(); // execução manual / preview
    expect(recoveryProcessingBlocker(armed, "id-preview--x.lovable.app")).not.toBeNull();
    expect(recoveryProcessingBlocker({ ...armed, armed: false }, "clever-ship-analyzer.lovable.app")).not.toBeNull();
    expect(recoveryProcessingBlocker({ ...armed, implementation: "outra" }, "clever-ship-analyzer.lovable.app")).not.toBeNull();
  });
});

describe("telefone e link", () => {
  it("normaliza celular com e sem o 9", () => {
    expect(phoneKey("(31) 9290-4210")).toBe("+5531992904210");
    expect(phoneVariants("+5531992904210")).toEqual(["+5531992904210", "+553192904210"]);
  });
  it("aceita só o link individual de checkout da própria loja", () => {
    expect(validateRecoveryUrl(URL_A, HOSTS)).toEqual({ ok: true, url: URL_A });
    expect(validateRecoveryUrl("https://maniadmulher.com/77747060914/orders/abc/authenticate?key=x", HOSTS).ok).toBe(false);
  });
});
