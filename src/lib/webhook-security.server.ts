/** Comparação de segredos em tempo constante (não vaza, pelo tempo de resposta, quantos caracteres batem). */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  // percorre sempre o maior tamanho; tamanhos diferentes já reprovam, mas sem encurtar o laço
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/**
 * Segredo que vai na URL do webhook da UazAPI (ela não assina o corpo). Derivado da chave de serviço do
 * banco — HMAC-SHA256 com um rótulo fixo —, então não precisa de variável nova e muda se a chave for trocada.
 * Devolve null se a chave de serviço não estiver disponível (aí o webhook recusa tudo).
 */
export async function uazapiWebhookSecret(): Promise<string | null> {
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!key) return null;
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode("uazapi-webhook-v1")));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

/** URL completa do webhook da UazAPI, já com o segredo. */
export async function uazapiWebhookUrl(appUrl: string, path: string): Promise<string> {
  const secret = await uazapiWebhookSecret();
  return secret ? `${appUrl}${path}?secret=${secret}` : `${appUrl}${path}`;
}
