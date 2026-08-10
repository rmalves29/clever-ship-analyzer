import { createServerFn } from "@tanstack/react-start";
import { getShopifyAdminCredentials, shopifyQuery } from "./shopify.functions";

/**
 * Tests the Shopify connection by fetching shop basic info and scopes.
 */
export const testShopifyConnection = createServerFn({ method: "POST" })
  .handler(async () => {
    try {
      const data = await shopifyQuery({
        data: {
          query: `
            query {
              shop {
                name
                myshopifyDomain
              }
              currentAppInstallation {
                accessScopes {
                  handle
                }
              }
            }
          `
        }
      });

      const scopes = data.currentAppInstallation.accessScopes.map((s: any) => s.handle);
      
      const requiredScopes = ["read_orders", "read_customers"];
      const missingScopes = requiredScopes.filter(s => !scopes.includes(s));
      const hasReadAll = scopes.includes("read_all_orders");

      // Update store_settings with last sync info
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("store_settings")
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_error: null,
          sync_status: "connected"
        })
        .eq("shopify_store_domain", data.shop.myshopifyDomain);

      return {
        success: true,
        shopName: data.shop.name,
        domain: data.shop.myshopifyDomain,
        scopes,
        missingScopes,
        hasReadAll,
        message: missingScopes.length > 0 
          ? `Conectado, mas faltam scopes: ${missingScopes.join(", ")}`
          : "Conexão estabelecida com sucesso."
      };
    } catch (error: any) {
      console.error("Connection test failed:", error);
      
      // Attempt to log error to DB if possible
      try {
        const { domain } = await getShopifyAdminCredentials();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("store_settings")
          .update({
            last_sync_error: error.message,
            sync_status: "error"
          })
          .eq("shopify_store_domain", domain);
      } catch (e) {}

      return {
        success: false,
        error: error.message,
        message: "Erro ao conectar com a Shopify."
      };
    }
  });
