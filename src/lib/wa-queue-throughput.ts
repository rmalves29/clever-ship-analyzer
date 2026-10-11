/**
 * Vazão do worker da fila de WhatsApp: ritmo máximo de envios por segundo (a API da Meta aceita 80/s por padrão)
 * e pool de envios simultâneos. Puro e testável: o relógio e o "sleep" entram por parâmetro.
 */

export type QueueThroughputConfig = {
  /** Envios iniciados por segundo (teto global do worker). */
  ratePerSec: number;
  /** Chamadas à Meta em andamento ao mesmo tempo. */
  concurrency: number;
  /** Itens reservados da fila por lote. */
  batchSize: number;
  /** Itens por "onda": ao fim de cada uma o resultado é gravado no banco de uma vez. */
  waveSize: number;
};

const clampInt = (raw: string | undefined, fallback: number, min: number, max: number): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.max(Math.floor(n), min), max) : fallback;
};

/** Padrões para 80 msg/s (limite padrão da Meta); ajustáveis por variável de ambiente sem novo código. */
export function readThroughputConfig(env: Record<string, string | undefined> = process.env): QueueThroughputConfig {
  const ratePerSec = clampInt(env["WA_QUEUE_RATE_PER_SEC"], 80, 1, 80);
  const concurrency = clampInt(env["WA_QUEUE_CONCURRENCY"], 40, 1, 100);
  const batchSize = clampInt(env["WA_QUEUE_BATCH_SIZE"], 400, 10, 1000);
  const waveSize = clampInt(env["WA_QUEUE_WAVE_SIZE"], 200, 10, 500);
  return { ratePerSec, concurrency, batchSize, waveSize };
}

export type Clock = { now: () => number; sleep: (ms: number) => Promise<void> };
const realClock: Clock = { now: () => Date.now(), sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };

/**
 * Distribui "largadas" em intervalos de 1/ratePerSec segundos: cada chamada recebe a próxima vaga livre e espera até
 * ela. Vários envios simultâneos pedem vaga ao mesmo tempo e saem escalonados — nunca mais que `ratePerSec` por segundo.
 */
export function createRateGate(ratePerSec: number, clock: Clock = realClock): () => Promise<void> {
  const interval = 1000 / Math.max(ratePerSec, 1);
  let next = 0;
  return async () => {
    const now = clock.now();
    const slot = Math.max(now, next);
    next = slot + interval;
    const wait = slot - now;
    if (wait > 0) await clock.sleep(wait);
  };
}

/** Roda `worker` em todos os itens com no máximo `concurrency` ao mesmo tempo (os demais esperam a vez). */
export async function runPool<T>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const lanes = Math.min(Math.max(concurrency, 1), items.length);
  await Promise.all(
    Array.from({ length: lanes }, async () => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        await worker(items[index] as T);
      }
    }),
  );
}

export type QueueOutcomeKind = "sent" | "retry" | "failed" | "cancelled";

/** Resultado de um item da fila, no formato aceito por `wa_queue_apply_results`. */
export type QueueOutcome = {
  job_id: string;
  recipient_id: string;
  kind: QueueOutcomeKind;
  wa_message_id?: string | null;
  error?: string | null;
  error_code?: string | null;
  next_attempt_at?: string | null;
  /** Telefone E.164 e texto renderizado: só em envios, para espelhar na caixa de entrada. */
  phone?: string | null;
  body?: string | null;
};

export function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Erros da Meta em que tentar de novo não adianta (telefone inválido/fora do WhatsApp, modelo inexistente, pausado ou
 * com variáveis fora do formato). Esses itens falham na hora, sem esperar horas por novas tentativas; os demais
 * (limite de taxa, instabilidade) continuam com repetição.
 */
const PERMANENT_META_CODES = new Set([
  "131009", // parâmetro inválido (ex.: telefone malformado)
  "131021", // destinatário é o próprio número de envio
  "131026", // mensagem não entregável (número sem WhatsApp, etc.)
  "131030", // destinatário fora da lista permitida
  "132000", // número de variáveis diferente do modelo
  "132001", // modelo não existe naquele idioma
  "132005", // texto traduzido longo demais
  "132007", // política de formato do modelo
  "132012", // variáveis fora do formato esperado
  "132015", // modelo pausado
  "132016", // modelo desativado
]);

export function isPermanentSendError(error: string | null | undefined): boolean {
  const code = String(error ?? "").match(/\b(1[0-9]{5})\b/)?.[1];
  return code !== undefined && PERMANENT_META_CODES.has(code);
}

/** Telefone com tamanho possível para E.164 (10 a 15 dígitos): fora disso nem chama a Meta. */
export function hasPlausiblePhoneLength(phone: string | null | undefined): boolean {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}
