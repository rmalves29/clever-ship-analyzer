import { createServerFn } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

// In-memory cache for access tokens
// Note: In a real production edge environment, you'd use a more persistent cache like Redis or a database table
// But for this implementation, we'll fetch from store_settings or re-auth if needed.
const TOKEN_CACHE: Record<string, { token: string; expiresAt: number }> = {};

/**
 * Validates and gets Shopify Admin Credentials (domain and accessToken).
 * Implements the client_credentials flow as requested.
 */
export const getShopifyAdminCredentials = createServerFn({ method: "GET" })
  .handler(async () => {
    // 1. Read store_settings from Supabase
    // We use the service role client here because this is a server-side internal utility 
    // that needs to access sensitive client_secret/tokens.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const { data: settings, error } = await supabaseAdmin
      .from("store_settings")
      .select("*")
      .single();

    if (error || !settings) {
      throw new Error("SHOP_NOT_FOUND: Store settings not found in database.");
    }

    const { 
      shopify_store_domain: shop, 
      shopify_client_id: clientId, 
      shopify_client_secret: clientSecret,
      shopify_admin_access_token: legacyToken 
    } = settings;

    if (!shop) throw new Error("INVALID_STORE: shopify_store_domain is missing.");
    if (!clientId || !clientSecret) {
      // Fallback to legacy token if present and looks like shpat_
      if (legacyToken?.startsWith("shpat_")) {
        return { domain: shop, accessToken: legacyToken };
      }
      throw new Error("INVALID_CLIENT_CREDENTIALS: Shopify Client ID or Secret is missing.");
    }

    // 2. Check cache
    const cached = TOKEN_CACHE[shop];
    if (cached && cached.expiresAt > Date.now() + 60000) { // 1 min buffer
      return { domain: shop, accessToken: cached.token };
    }

    // 3. Official client_credentials flow
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

    const data = await response.json();
    const accessToken = data.access_token;
    const expiresIn = data.expires_in; // usually 0 or seconds

    // 4. Cache it (if expiresIn is provided, otherwise default to 24h)
    const duration = expiresIn > 0 ? expiresIn * 1000 : 24 * 60 * 60 * 1000;
    TOKEN_CACHE[shop] = {
      token: accessToken,
      expiresAt: Date.now() + duration,
    };

    return { domain: shop, accessToken };
  });

/**
 * Executes a GraphQL query against Shopify Admin API.
 */
export const shopifyQuery = createServerFn({ method: "POST" })
  .input(z.object({
    query: z.string(),
    variables: z.record(z.any()).optional(),
  }))
  .handler(async ({ data: { query, variables } }) => {
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

    const result = await response.json();
    if (result.errors) {
      console.error("GraphQL Errors:", result.errors);
      throw new Error("INVALID_QUERY: GraphQL returned errors.");
    }

    return result.data;
  });
