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
          cancelledAt
          displayFinancialStatus
          displayFulfillmentStatus
          currencyCode
          email
          phone
          sourceName
          subtotalPriceSet { presentmentMoney { amount } }
          totalDiscountsSet { presentmentMoney { amount } }
          discountCodes
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
                product { id }
                variant { id }
                discountedUnitPriceSet { presentmentMoney { amount } }
                totalDiscountSet { presentmentMoney { amount } }
              }
            }
          }
          fulfillments(first: 10) {
            id
            status
            displayStatus
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

const PRODUCT_DETAIL_FIELDS = `
  id
  handle
  title
  description
  onlineStorePreviewUrl
  featuredImage { url }
`;

export type ShopifyProductDetail = {
  id: string;
  handle: string;
  title: string;
  description: string | null;
  featuredImageUrl: string | null;
  productUrl: string | null;
};

function mapProductNode(node: any, storeUrl: string | null): ShopifyProductDetail | null {
  if (!node?.id) return null;
  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    description: node.description || null,
    featuredImageUrl: node.featuredImage?.url ?? null,
    productUrl: node.onlineStorePreviewUrl ?? (storeUrl && node.handle ? `${storeUrl}/products/${node.handle}` : null),
  };
}

/** Resolve 1 produto pelo GID completo (ex: vindo de shopify_order_items.product_id). */
export async function getShopifyProductById(productGid: string): Promise<ShopifyProductDetail | null> {
  try {
    const [data, storeUrl] = await Promise.all([
      shopifyGraphQL(`query getProduct($id: ID!) { product(id: $id) { ${PRODUCT_DETAIL_FIELDS} } }`, { id: productGid }),
      getShopifyStoreUrl(),
    ]);
    return mapProductNode(data?.product, storeUrl);
  } catch (error) {
    console.error("getShopifyProductById falhou:", error);
    return null;
  }
}

/** Resolve 1 produto pelo handle (ex: extraído do landing_page_path do ShopifyQL). */
export async function getShopifyProductByHandle(handle: string): Promise<ShopifyProductDetail | null> {
  try {
    const [data, storeUrl] = await Promise.all([
      shopifyGraphQL(`query getProductByHandle($handle: String!) { productByHandle(handle: $handle) { ${PRODUCT_DETAIL_FIELDS} } }`, { handle }),
      getShopifyStoreUrl(),
    ]);
    return mapProductNode(data?.productByHandle, storeUrl);
  } catch (error) {
    console.error("getShopifyProductByHandle falhou:", error);
    return null;
  }
}

/** Resolve vários produtos de uma vez via `nodes(ids: [...])` — evita N chamadas sequenciais
 *  ao montar os slots de "mais vendido" do lote/dashboard. */
export async function getShopifyProductsByIds(productGids: string[]): Promise<Map<string, ShopifyProductDetail>> {
  const map = new Map<string, ShopifyProductDetail>();
  if (productGids.length === 0) return map;
  try {
    const [data, storeUrl] = await Promise.all([
      shopifyGraphQL(
        `query getProducts($ids: [ID!]!) { nodes(ids: $ids) { ... on Product { ${PRODUCT_DETAIL_FIELDS} } } }`,
        { ids: productGids },
      ),
      getShopifyStoreUrl(),
    ]);
    for (const node of (data?.nodes ?? []) as any[]) {
      const detail = mapProductNode(node, storeUrl);
      if (detail) map.set(detail.id, detail);
    }
  } catch (error) {
    console.error("getShopifyProductsByIds falhou:", error);
  }
  return map;
}

const DISCOUNT_CODE_BASIC_CREATE_MUTATION = `
  mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
      codeDiscountNode { id }
      userErrors { field message code }
    }
  }
`;

export type DiscountCodeBasicCreateInput = {
  title: string;
  code: string;
  /** Percentual (fração 0-1) OU valor fixo em dinheiro — exatamente um dos dois. */
  percentageFraction?: number;
  fixedAmount?: number; // valor fixo, na moeda da loja
  startsAt: string; // ISO
  endsAt: string; // ISO
  /** Padrão false (mantém o comportamento já em produção pro cupom VIP de domingo). */
  appliesOncePerCustomer?: boolean;
};

/** Cria um cupom de desconto de verdade na Shopify (percentual ou valor fixo) — sem restrição
 *  técnica de cliente por padrão (regra de negócio é só copy, "exclusivo Grupo VIP" fica no texto
 *  da mensagem, não aqui), não combinável com desconto de produto em promoção nem com desconto
 *  progressivo (order discount), válido até `endsAt`. Nunca lança — devolve {success:false} pro
 *  caller decidir o fallback (não travar o lote inteiro por causa da Shopify). */
export async function createShopifyDiscountCodeBasic(
  input: DiscountCodeBasicCreateInput,
): Promise<{ success: true; discountId: string } | { success: false; error: string }> {
  try {
    const value =
      input.fixedAmount != null
        ? { discountAmount: { amount: input.fixedAmount, appliesOnEachItem: false } }
        : { percentage: input.percentageFraction };

    const data = await shopifyGraphQL(DISCOUNT_CODE_BASIC_CREATE_MUTATION, {
      basicCodeDiscount: {
        title: input.title,
        code: input.code,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        customerSelection: { all: true },
        customerGets: { value, items: { all: true } },
        appliesOncePerCustomer: input.appliesOncePerCustomer ?? false,
        combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true },
      },
    });
    const result = data?.discountCodeBasicCreate;
    const userErrors = result?.userErrors ?? [];
    if (userErrors.length > 0) {
      return { success: false, error: userErrors.map((e: any) => e.message).join("; ") };
    }
    const discountId = result?.codeDiscountNode?.id;
    if (!discountId) return { success: false, error: "Shopify não retornou o ID do cupom criado." };
    return { success: true, discountId };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao criar cupom na Shopify." };
  }
}

const DISCOUNT_CODE_DELETE_MUTATION = `
  mutation discountCodeDelete($id: ID!) {
    discountCodeDelete(id: $id) {
      deletedCodeDiscountId
      userErrors { field message code }
    }
  }
`;

export type CashbackDiscountInput = {
  title: string;
  code: string;
  /** Valor fixo em dinheiro do cashback. */
  amount: number;
  /** Subtotal mínimo exigido para usar o cupom. */
  minimumSubtotal: number;
  startsAt: string; // ISO — libera 3 dias após a compra
  endsAt: string; // ISO
  /** GID do cliente Shopify que ganhou o cashback (restrição real do cupom). */
  customerGid: string;
};

/** Cria o cupom de cashback na Shopify: valor fixo, restrito ao cliente do pedido,
 *  com subtotal mínimo, uso único e uma vez por cliente. Nunca lança — devolve
 *  {success:false} para o caller registrar o erro sem derrubar a sincronização. */
export async function createShopifyCashbackDiscount(
  input: CashbackDiscountInput,
): Promise<{ success: true; discountId: string } | { success: false; error: string }> {
  try {
    const data = await shopifyGraphQL(DISCOUNT_CODE_BASIC_CREATE_MUTATION, {
      basicCodeDiscount: {
        title: input.title,
        code: input.code,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        usageLimit: 1,
        appliesOncePerCustomer: true,
        customerSelection: { customers: { add: [input.customerGid] } },
        minimumRequirement: { subtotal: { greaterThanOrEqualToSubtotal: input.minimumSubtotal } },
        customerGets: {
          value: { discountAmount: { amount: input.amount, appliesOnEachItem: false } },
          items: { all: true },
        },
        combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true },
      },
    });
    const result = data?.discountCodeBasicCreate;
    const userErrors = result?.userErrors ?? [];
    if (userErrors.length > 0) {
      return { success: false, error: userErrors.map((e: any) => e.message).join("; ") };
    }
    const discountId = result?.codeDiscountNode?.id;
    if (!discountId) return { success: false, error: "Shopify não retornou o ID do cupom criado." };
    return { success: true, discountId };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Falha ao criar cupom na Shopify." };
  }
}

/** Remove um cupom de desconto da Shopify (usado quando o pedido é cancelado).
 *  Um cupom que já não existe mais é tratado como sucesso — o objetivo é a ausência dele. */
export async function deleteShopifyDiscountCode(
  discountId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const data = await shopifyGraphQL(DISCOUNT_CODE_DELETE_MUTATION, { id: discountId });
    const userErrors = data?.discountCodeDelete?.userErrors ?? [];
    if (userErrors.length > 0) {
      const message = userErrors.map((e: any) => e.message).join("; ");
      if (/not found|does not exist|inexistente/i.test(message)) return { success: true };
      return { success: false, error: message };
    }
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao remover cupom na Shopify.";
    if (/not found|does not exist/i.test(message)) return { success: true };
    return { success: false, error: message };
  }
}
