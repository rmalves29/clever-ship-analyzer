/**
 * Provider MOCK do WhatsApp — uso exclusivo em testes de arquitetura da fila.
 *
 * Regras de segurança:
 * - NUNCA faz chamada de rede (nem Meta, nem UazAPI, nem qualquer HTTP).
 * - Só aceita jobs cujo `dedup_key` começa com MOCK_DEDUP_PREFIX.
 * - Retorna resposta determinística, derivada do id do job.
 */

export const MOCK_DEDUP_PREFIX = "mock-test:";

export type MockSendResult =
  | { ok: true; waMessageId: string; raw: Record<string, unknown> }
  | { ok: false; error: string; raw: Record<string, unknown> };

export function isMockJob(dedupKey: string | null | undefined): boolean {
  return typeof dedupKey === "string" && dedupKey.startsWith(MOCK_DEDUP_PREFIX);
}

/**
 * Simula o envio de um template. Determinístico:
 * - dedup_key contendo "fail" → erro simulado (para testar retry/backoff);
 * - caso contrário → sucesso com wa_message_id fictício `wamid.MOCK-<jobId>`.
 */
export async function sendTemplateMessageMock(input: {
  jobId: string;
  to: string;
  templateName: string;
  templateLanguage: string;
  bodyParams: string[];
  dedupKey: string | null;
}): Promise<MockSendResult> {
  const raw = {
    provider: "mock",
    simulated: true,
    to: input.to,
    template: { name: input.templateName, language: input.templateLanguage, params: input.bodyParams.length },
  };

  if ((input.dedupKey ?? "").includes("fail")) {
    return { ok: false, error: "[mock] falha simulada do provider (sem chamada externa)", raw };
  }

  return { ok: true, waMessageId: `wamid.MOCK-${input.jobId}`, raw };
}
