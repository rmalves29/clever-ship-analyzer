import { describe, expect, it } from "vitest";
import { chunkArray, createRateGate, hasPlausiblePhoneLength, isPermanentSendError, readThroughputConfig, runPool, type Clock } from "./wa-queue-throughput";

function fakeClock(): Clock & { t: number } {
  const c = {
    t: 0,
    now: () => c.t,
    sleep: async (ms: number) => {
      c.t += ms;
    },
  };
  return c;
}

describe("createRateGate", () => {
  it("espaça as largadas em 1/taxa segundos (80/s = 12,5 ms)", async () => {
    const clock = fakeClock();
    const gate = createRateGate(80, clock);
    const starts: number[] = [];
    for (let i = 0; i < 160; i++) {
      await gate();
      starts.push(clock.t);
    }
    // 160 envios a 80/s levam ~2s e nunca passam de 80 largadas em um mesmo segundo
    expect(starts[159]! - starts[0]!).toBeGreaterThanOrEqual(1987);
    expect(starts[159]! - starts[0]!).toBeLessThan(2100);
    const inFirstSecond = starts.filter((s) => s < 1000).length;
    expect(inFirstSecond).toBeLessThanOrEqual(80);
  });

  it("não atrasa quando a taxa é baixa e há folga", async () => {
    const clock = fakeClock();
    const gate = createRateGate(2, clock);
    await gate();
    clock.t += 5000;
    const before = clock.t;
    await gate();
    expect(clock.t).toBe(before);
  });
});

describe("runPool", () => {
  it("nunca passa do limite de simultâneos e processa todos", async () => {
    let running = 0;
    let peak = 0;
    const done: number[] = [];
    await runPool(Array.from({ length: 50 }, (_, i) => i), 7, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 2));
      running--;
      done.push(n);
    });
    expect(done).toHaveLength(50);
    expect(new Set(done).size).toBe(50);
    expect(peak).toBeLessThanOrEqual(7);
    expect(peak).toBeGreaterThan(1);
  });

  it("aceita lista vazia", async () => {
    await expect(runPool([], 10, async () => undefined)).resolves.toBeUndefined();
  });
});

describe("readThroughputConfig / chunkArray", () => {
  it("usa 80/s por padrão e respeita o teto da Meta e limites seguros", () => {
    expect(readThroughputConfig({})).toEqual({ ratePerSec: 80, concurrency: 40, batchSize: 400, waveSize: 200 });
    expect(readThroughputConfig({ WA_QUEUE_RATE_PER_SEC: "500" }).ratePerSec).toBe(80);
    expect(readThroughputConfig({ WA_QUEUE_RATE_PER_SEC: "20", WA_QUEUE_CONCURRENCY: "abc" })).toMatchObject({ ratePerSec: 20, concurrency: 40 });
  });

  it("divide em blocos", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkArray([], 3)).toEqual([]);
  });
});

describe("erros permanentes e telefone", () => {
  it("não repete erros que não mudam e repete os temporários", () => {
    expect(isPermanentSendError("(#131009) Parameter value is not valid")).toBe(true);
    expect(isPermanentSendError("131026 — Message undeliverable")).toBe(true);
    expect(isPermanentSendError("(#132000) Number of parameters does not match")).toBe(true);
    expect(isPermanentSendError("(#131056) Pair rate limit hit")).toBe(false);
    expect(isPermanentSendError("(#130429) Rate limit hit")).toBe(false);
    expect(isPermanentSendError("Erro Meta: 500")).toBe(false);
    expect(isPermanentSendError(null)).toBe(false);
  });

  it("recusa telefones de tamanho impossível", () => {
    expect(hasPlausiblePhoneLength("+5531992904210")).toBe(true);
    expect(hasPlausiblePhoneLength("+0800033")).toBe(false);
    expect(hasPlausiblePhoneLength("+88888888990998878887878787787878676767677767")).toBe(false);
    expect(hasPlausiblePhoneLength("")).toBe(false);
  });
});
