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
    console.error("Shopify Auth Error Details:", { status: response.status, body: rawBody });
    throw new Error(`INVALID_CLIENT_CREDENTIALS: falha ao autenticar na Shopify (HTTP ${response.status}). Detalhes: ${rawBody.slice(0, 200)}`);
  }

  TOKEN_CACHE[shop] = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 86_000) * 1000,
  };

  return { domain: shop, accessToken: json.access_token };
}

/** Server-only helper: executes a GraphQL query against the Shopify Admin API.
 *  `apiVersion` sobrescreve a versão padrão só pra essa chamada — usado por `shopifyqlQuery`,
 *  que exige API 2025-10+, sem subir a versão global (usada por outros callers já testados). */
export async function shopifyGraphQL(
  query: string,
  variables?: Record<string, unknown>,
  apiVersion?: string,
): Promise<any> {
  const { domain, accessToken } = await getShopifyCredentials();

  const response = await fetch(`https://${domain}/admin/api/${apiVersion ?? SHOPIFY_API_VERSION}/graphql.json`, {
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

  // Devolve o `data` já desembrulhado — todos os callers (crm-sync.functions.ts, etc.) esperam
  // acessar os campos direto (ex: result.orders), não result.data.orders.
  return result.data;
}

export const ORDERS_QUERY = `
  query getOrders($cursor: String, $query: String) {
    orders(first: 100, after: $cursor, sortKey: UPDATED_AT, reverse: false, query: $query) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          name
          createdAt
          processedAt
          updatedAt
          displayFinancialStatus
          displayFulfillmentStatus
          currencyCode
          email
          phone
          sourceName
          subtotalPriceSet { presentmentMoney { amount } }
          totalDiscountsSet { presentmentMoney { amount } }
          totalShippingPriceSet { presentmentMoney { amount } }
          totalTaxSet { presentmentMoney { amount } }
          totalPriceSet { presentmentMoney { amount } }
          shippingAddress { name firstName lastName city province country phone address1 address2 zip }
          customer {
            id
            email
            firstName
            lastName
            phone
            addresses(first: 5) { phone }
            defaultAddress { phone }
          }
          lineItems(first: 100) {
            edges {
              node {
                id
                title
                quantity
                variantTitle
                sku
                discountedUnitPriceSet { presentmentMoney { amount } }
                totalDiscountSet { presentmentMoney { amount } }
              }
            }
          }
          fulfillments(first: 10) {
            id
            status
            createdAt
            updatedAt
            trackingInfo(first: 1) { company number url }
          }
        }
      }
    }
  }
`;

export const ABANDONED_CHECKOUTS_QUERY = `
  query getAbandonedCheckouts($cursor: String) {
    abandonedCheckouts(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          email
          createdAt
          updatedAt
          abandonedCheckoutUrl
          totalPriceSet { presentmentMoney { amount } }
          phone
          shippingAddress {
            phone
            city
            province
            country
          }
          customer {
            id
            email
            firstName
            lastName
            phone
            defaultAddress {
              city
              province
              country
              phone
            }
            addresses(first: 5) { phone }
          }
          lineItems(first: 5) {
            title
            quantity
            variant { title price }
          }
        }
      }
    }
  }
`;



export const CUSTOMERS_QUERY = `
  query getCustomers($cursor: String) {
    customers(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          email
          firstName
          lastName
          phone
          updatedAt
          createdAt
          addresses(first: 5) {
            phone
            city
            province
            country
            zip
          }
          defaultAddress {
            city
            province
            country
            phone
          }
        }
      }
    }
  }
`;

const ACTIVE_PROMOTIONS_QUERY = `
  query getActivePromotions {
    discountNodes(first: 10, query: "status:ACTIVE") {
      edges {
        node {
          id
          discount {
            __typename
            ... on DiscountAutomaticBasic { title summary }
            ... on DiscountAutomaticBxgy { title summary }
            ... on DiscountCodeBasic { title summary codes(first: 1) { nodes { code } } }
            ... on DiscountCodeBxgy { title summary codes(first: 1) { nodes { code } } }
            ... on DiscountCodeFreeShipping { title summary codes(first: 1) { nodes { code } } }
          }
        }
      }
    }
  }
`;

export type ActivePromotion = { title: string; summary: string | null; code: string | null };

/** Promoções/descontos ativos AGORA na loja — consulta ao vivo (sem sync/tabela), usada só no
 *  momento de gerar conteúdo pra IA saber se tem algo rolando pra mencionar. */
export async function getActiveShopifyPromotions(): Promise<{ success: true; promotions: ActivePromotion[] } | { success: false; error: string }> {
  try {
    const data = await shopifyGraphQL(ACTIVE_PROMOTIONS_QUERY);
    const edges: any[] = data?.discountNodes?.edges ?? [];
    const promotions: ActivePromotion[] = edges
      .map((e) => e.node?.discount)
      .filter(Boolean)
      .map((d: any) => ({
        title: d.title ?? "Promoção ativa",
        summary: d.summary ?? null,
        code: d.codes?.nodes?.[0]?.code ?? null,
      }));
    return { success: true, promotions };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao consultar promoções na Shopify." };
  }
}

/** URL pública da loja, pra montar link de produto/coleção nas postagens geradas por IA. */
export async function getShopifyStoreUrl(): Promise<string | null> {
  try {
    const { domain } = await getShopifyCredentials();
    return `https://${domain}`;
  } catch {
    return null;
  }
}
