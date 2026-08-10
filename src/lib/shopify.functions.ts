import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// In-memory cache for access tokens
const TOKEN_CACHE: Record<string, { token: string; expiresAt: number }> = {};

/**
 * Validates and gets Shopify Admin Credentials (domain and accessToken).
 * Implements the client_credentials flow as requested.
 */
export const getShopifyAdminCredentials = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    // Use maybeSingle instead of single to handle empty state gracefully
    const { data: settings, error } = await supabaseAdmin
      .from("store_settings")
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("Database error fetching store settings:", error);
      throw new Error("DB_ERROR: Failed to fetch store settings.");
    }

    if (!settings) {
      throw new Error("SHOP_NOT_FOUND: Store settings not found in database. Please configure them first.");
    }

    const { 
      shopify_store_domain: shop, 
      shopify_client_id: clientId, 
      shopify_client_secret: clientSecret,
      shopify_admin_access_token: legacyToken 
    } = settings;

    if (!shop) throw new Error("INVALID_STORE: shopify_store_domain is missing.");
    
    // Fallback logic
    if (!clientId || !clientSecret) {
      if (legacyToken?.startsWith("shpat_")) {
        return { domain: shop, accessToken: legacyToken };
      }
      throw new Error("INVALID_CLIENT_CREDENTIALS: Shopify Client ID or Secret is missing.");
    }

    // Check cache
    const cached = TOKEN_CACHE[shop];
    if (cached && cached.expiresAt > Date.now() + 60000) {
      return { domain: shop, accessToken: cached.token };
    }

    // Official client_credentials flow
    const tokenUrl = `https://${shop}/admin/oauth/access_token`;
    const params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    params.append("client_id", clientId);
    params.append("client_secret", clientSecret);

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("Shopify Auth Error:", errBody);
      throw new Error("INVALID_CLIENT_CREDENTIALS: Failed to authenticate with Shopify.");
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    const accessToken = data.access_token;
    const expiresIn = data.expires_in;

    const duration = expiresIn > 0 ? expiresIn * 1000 : 24 * 60 * 60 * 1000;
    TOKEN_CACHE[shop] = {
      token: accessToken,
      expiresAt: Date.now() + duration,
    };

    return { domain: shop, accessToken };
  });

const shopifyQuerySchema = z.object({
  query: z.string(),
  variables: z.record(z.any()).optional(),
});

/**
 * Executes a GraphQL query against Shopify Admin API.
 */
export const shopifyQuery = createServerFn({ method: "POST" })
  .validator((data: unknown) => shopifyQuerySchema.parse(data))
  .handler(async ({ data }) => {
    const { query, variables } = data;
    const { domain, accessToken } = await getShopifyAdminCredentials();

    const url = `https://${domain}/admin/api/2024-07/graphql.json`;

    const response = await fetch(url, {
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

    if (!response.ok) {
      const errText = await response.text();
      console.error("Shopify GraphQL Error:", errText);
      throw new Error(`INVALID_QUERY: Shopify API returned ${response.status}`);
    }

    const result = await response.json() as { data?: any; errors?: any[] };
    if (result.errors) {
      console.error("GraphQL Errors:", result.errors);
      throw new Error("INVALID_QUERY: GraphQL returned errors.");
    }

    return result.data;
  });
