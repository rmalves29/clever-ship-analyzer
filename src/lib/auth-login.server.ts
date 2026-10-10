import { clientIp, rateLimit, sha256Hex, tooManyRequests } from "./rate-limit.server";
import { isEmailAllowed } from "./app-auth";

export const AUTH_LOGIN_PATH = "/api/auth/login";

// Por IP + e-mail: bloqueia adivinhar a senha de uma conta. Por IP: bloqueia varrer várias contas.
const PER_ACCOUNT = { limit: 5, windowSec: 15 * 60 };
const PER_IP = { limit: 30, windowSec: 15 * 60 };

const json = (body: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "Cache-Control": "no-store", ...headers } });

/**
 * Login com limite de tentativas. O navegador manda e-mail/senha para cá (e não direto ao Supabase); o servidor
 * conta as tentativas e, se passar, faz o login no Supabase e devolve a sessão para o navegador guardar.
 */
export async function handleAuthLogin(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let email = "";
  let password = "";
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return json({ error: "Requisição inválida." }, 400);
  }
  if (!email || !password || email.length > 254 || password.length > 1024) return json({ error: "Informe e-mail e senha." }, 400);

  const ip = clientIp(request);
  const ipLimit = await rateLimit({ key: `login:ip:${ip}`, ...PER_IP, persistent: true });
  if (!ipLimit.allowed) return tooManyRequests(ipLimit);
  const accountKey = `login:acct:${ip}:${(await sha256Hex(email)).slice(0, 32)}`;
  const accountLimit = await rateLimit({ key: accountKey, ...PER_ACCOUNT, persistent: true });
  if (!accountLimit.allowed) return tooManyRequests(accountLimit);

  // Quem não está na lista de acesso do CRM recebe a mesma resposta de senha errada (não revela quem existe).
  if (!isEmailAllowed(email)) return json({ error: "Invalid login credentials" }, 400);

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return json({ error: "Servidor sem configuração de login." }, 500);

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) return json({ error: error?.message ?? "Invalid login credentials" }, 400);

  return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
}
