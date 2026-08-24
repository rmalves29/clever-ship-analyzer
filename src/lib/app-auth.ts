import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Gate de autenticação das server functions.
 *
 * Trava de segurança operacional: enquanto `APP_AUTH_ENABLED` não for `"true"`,
 * o middleware apenas deixa passar (comportamento atual preservado). Isso evita
 * travar o sistema antes de existir o primeiro usuário no Auth.
 *
 * Depois de criar o primeiro usuário e validar o login em `/auth`, basta definir
 * o secret `APP_AUTH_ENABLED=true` para que TODAS as server functions passem a
 * exigir um bearer token válido — sem mais nenhuma alteração de código.
 */
export function isAppAuthEnabled(): boolean {
  return process.env["APP_AUTH_ENABLED"] === "true";
}

async function verifyBearer(): Promise<{ userId: string }> {
  const SUPABASE_URL = process.env["SUPABASE_URL"];
  const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Unauthorized: backend não configurado");
  }

  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Unauthorized: sessão necessária");
  }
  const token = authHeader.slice("Bearer ".length);
  if (token.split(".").length !== 3) {
    throw new Error("Unauthorized: token inválido");
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    throw new Error("Unauthorized: token inválido");
  }
  return { userId: String(data.claims.sub) };
}

/** Exige sessão autenticada quando o gate está ligado; caso contrário, passa direto. */
export const requireAppAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  if (!isAppAuthEnabled()) return next({ context: { appUserId: null as string | null } });
  const { userId } = await verifyBearer();
  return next({ context: { appUserId: userId as string | null } });
});
