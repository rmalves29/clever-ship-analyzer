import { beforeEach, describe, expect, it } from "vitest";
import { clientIp, memoryHit, resetMemoryLimits } from "./rate-limit.server";

beforeEach(() => resetMemoryLimits());

describe("memoryHit", () => {
  it("libera até o limite e bloqueia depois, com tempo de espera", () => {
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) expect(memoryHit("k", 5, 60, t + i).allowed).toBe(true);
    const r = memoryHit("k", 5, 60, t + 10);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.retryAfter).toBeGreaterThan(0);
    expect(r.retryAfter).toBeLessThanOrEqual(60);
  });

  it("zera na janela seguinte e separa chaves diferentes", () => {
    const t = 5_000_000;
    for (let i = 0; i < 3; i++) memoryHit("a", 2, 10, t);
    expect(memoryHit("a", 2, 10, t).allowed).toBe(false);
    expect(memoryHit("b", 2, 10, t).allowed).toBe(true);
    expect(memoryHit("a", 2, 10, t + 10_001).allowed).toBe(true);
  });
});

describe("clientIp", () => {
  it("usa o primeiro IP do x-forwarded-for", () => {
    expect(clientIp(new Request("https://x.test", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } }))).toBe("1.2.3.4");
    expect(clientIp(new Request("https://x.test"))).toBe("unknown");
  });
});
