/**
 * Rate limit em duas camadas:
 *  - persistente (função `rate_limit_hit` no banco): vale entre todas as instâncias do servidor — usado onde importa
 *    (login, captura de lead, desbloqueio do gate);
 *  - em memória (por instância): barato, sem ida ao banco — usado nas rotas de alto volume e nas server functions.
 * Se o banco falhar ou a função não existir, cai para a memória (nunca derruba a requisição por causa do limitador).
 */

export type RateResult = { allowed: boolean; remaining: number; retryAfter: number };

type Bucket = { start: number; count: number };
const memory = new Map<string, Bucket>();

/** Contador em memória, janela fixa. Exportado para teste. */
export function memoryHit(key: string, limit: number, windowSec: number, now = Date.now()): RateResult {
  if (memory.size > 5000) {
    for (const [k, b] of memory) if (now - b.start > 3_600_000) memory.delete(k);
    if (memory.size > 5000) memory.clear(); // proteção contra explosão de chaves
  }
  const windowMs = windowSec * 1000;
  let b = memory.get(key);
  if (!b || now - b.start >= windowMs) {
    b = { start: now, count: 0 };
    memory.set(key, b);
  }
  b.count += 1;
  return {
    allowed: b.count <= limit,
    remaining: Math.max(limit - b.count, 0),
    retryAfter: Math.max(Math.ceil((b.start + windowMs - now) / 1000), 1),
  };
}

export function resetMemoryLimits(): void {
  memory.clear();
}

/** IP do cliente. Na Vercel `x-forwarded-for` é preenchido pela plataforma (primeiro item = cliente). */
export function clientIp(request: Request): string {
  const h = request.headers;
  const fromXff = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || h.get("cf-connecting-ip") || fromXff || h.get("x-real-ip") || "unknown";
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

let warnedFallback = false;

export async function rateLimit(opts: { key: string; limit: number; windowSec: number; persistent?: boolean }): Promise<RateResult> {
  const { key, limit, windowSec } = opts;
  if (opts.persistent) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await (supabaseAdmin as any).rpc("rate_limit_hit", {
        p_key: key,
        p_window_seconds: windowSec,
        p_limit: limit,
      });
      const row = Array.isArray(data) ? data[0] : data;
      if (!error && row && typeof row.allowed === "boolean") {
        return { allowed: row.allowed, remaining: Number(row.remaining ?? 0), retryAfter: Number(row.retry_after ?? windowSec) };
      }
      if (!warnedFallback) {
        warnedFallback = true;
        console.warn("rate-limit: função rate_limit_hit indisponível, usando limite em memória:", error?.message);
      }
    } catch (error) {
      if (!warnedFallback) {
        warnedFallback = true;
        console.warn("rate-limit: falha ao consultar o banco, usando limite em memória:", error);
      }
    }
  }
  return memoryHit(key, limit, windowSec);
}

export function tooManyRequests(result: RateResult, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify({ error: "Muitas tentativas. Aguarde um pouco e tente de novo.", retryAfter: result.retryAfter }), {
    status: 429,
    headers: { "content-type": "application/json", "Retry-After": String(result.retryAfter), ...headers },
  });
}
