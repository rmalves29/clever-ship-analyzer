import { createServerFn } from "@tanstack/react-start";


/**
 * Tests the Shopify connection by fetching shop basic info and scopes.
 */
export const testShopifyConnection = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { shopifyGraphQL } = await import("./shopify.server");
  try {
    const data: any = await shopifyGraphQL(`
      query {
        shop { name myshopifyDomain }
        currentAppInstallation { accessScopes { handle } }
      }
    `);

    const scopes: string[] = data.currentAppInstallation.accessScopes.map((s: any) => s.handle);

    const requiredScopes = ["read_orders", "read_customers", "read_products", "read_fulfillments"];
    const missingScopes = requiredScopes.filter((s) => !scopes.includes(s));
    const hasReadAll = scopes.includes("read_all_orders");

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
      scopes,
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
