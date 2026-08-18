import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";


/**
 * Tests the Shopify connection by fetching shop basic info and scopes.
 */
export const testShopifyConnection = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.any().parse(data))
  .handler(async () => {
  try {
    const { shopifyGraphQL } = await import("./shopify.server");
    const data: any = await shopifyGraphQL(`
      query {
        shop { name myshopifyDomain }
        currentAppInstallation { accessScopes { handle description } }
      }
    `);

    const scopesData = data.currentAppInstallation.accessScopes || [];
    const scopes: string[] = scopesData.map((s: any) => s.handle);

    const requiredScopes = ["read_orders", "read_customers", "read_products", "read_fulfillments"];
    const missingScopes = requiredScopes.filter((s) => !scopes.includes(s));
    const hasReadAll = scopes.includes("read_all_orders");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("store_settings")
      .update({
        last_sync_error: null,
        sync_status: missingScopes.length > 0 ? "error" : "connected",
      })
      .eq("shopify_store_domain", data.shop.myshopifyDomain);

    return {
      success: missingScopes.length === 0,
      shopName: data.shop.name,
      domain: data.shop.myshopifyDomain,
      scopes: scopesData,
      missingScopes,
      hasReadAll,
      message:
        missingScopes.length > 0
          ? `Conectado, mas faltam scopes: ${missingScopes.join(", ")}`
          : `Conectado à loja ${data.shop.name}.`,
    };
  } catch (error: any) {
    console.error("Connection test failed:", error);
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("store_settings")
        .update({ last_sync_error: error.message, sync_status: "error" })
        .neq("id", "00000000-0000-0000-0000-000000000000");
    } catch {
      /* ignore */
    }

    return {
      success: false,
      scopes: [] as string[],
      missingScopes: [] as string[],
      error: error.message,
      message: `Erro ao conectar com a Shopify: ${error.message}`,
    };
  }
});
