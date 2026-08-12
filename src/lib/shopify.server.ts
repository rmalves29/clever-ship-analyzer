export const SHOPIFY_API_VERSION = "2025-01";

// In-memory cache for access tokens (client_credentials tokens last ~24h)
const TOKEN_CACHE: Record<string, { token: string; expiresAt: number }> = {};

function normalizeDomain(domain: string) {
  return domain.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/** Server-only helper: resolves Shopify admin credentials (client_credentials flow). */
export async function getShopifyCredentials(): Promise<{ domain: string; accessToken: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: settings, error } = await supabaseAdmin
    .from("store_settings")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Database error fetching store settings:", error);
    throw new Error("DB_ERROR: Failed to fetch store settings.");
  }

  if (!settings) {
    throw new Error("SHOP_NOT_FOUND: Configure as credenciais da loja em Configurações.");
  }

  const {
    shopify_store_domain: rawShop,
    shopify_client_id: clientId,
    shopify_client_secret: clientSecret,
    shopify_admin_access_token: legacyToken,
  } = settings;

  if (!rawShop) throw new Error("INVALID_STORE: shopify_store_domain is missing.");
  const shop = normalizeDomain(rawShop);

  if (!clientId || !clientSecret) {
    if (legacyToken?.startsWith("shpat_")) {
      return { domain: shop, accessToken: legacyToken };
    }
    throw new Error("INVALID_CLIENT_CREDENTIALS: Client ID ou Client Secret ausente.");
  }

  const cached = TOKEN_CACHE[shop];
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return { domain: shop, accessToken: cached.token };
  }

  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const rawBody = await response.text();
  let json: { access_token?: string; expires_in?: number } | null = null;
  try {
    json = JSON.parse(rawBody);
  } catch {
    json = null;
  }

  if (!response.ok || !json?.access_token) {
    console.error("Shopify Auth Error:", response.status, rawBody.slice(0, 1000));
    throw new Error(`INVALID_CLIENT_CREDENTIALS: falha ao autenticar na Shopify (HTTP ${response.status}).`);
  }

  TOKEN_CACHE[shop] = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 86_000) * 1000,
  };

  return { domain: shop, accessToken: json.access_token };
}

/** Server-only helper: executes a GraphQL query against the Shopify Admin API. */
export async function shopifyGraphQL(query: string, variables?: Record<string, unknown>): Promise<any> {
  const { domain, accessToken } = await getShopifyCredentials();

  const response = await fetch(`https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (response.status === 429) {
    throw new Error("RATE_LIMIT: Shopify API rate limit exceeded.");
  }

  const rawBody = await response.text();
  let result: { data?: any; errors?: any[] } | null = null;
  try {
    result = JSON.parse(rawBody);
  } catch {
    result = null;
  }

  if (!response.ok || !result) {
    console.error("Shopify GraphQL Error:", response.status, rawBody.slice(0, 1000));
    throw new Error(`SHOPIFY_HTTP_${response.status}: erro ao consultar a Shopify.`);
  }

  if (result.errors) {
    console.error("GraphQL Errors:", JSON.stringify(result.errors).slice(0, 1000));
    throw new Error(`INVALID_QUERY: ${result.errors[0]?.message ?? "GraphQL error"}`);
  }

  return result.data;
}
