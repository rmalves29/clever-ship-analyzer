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
    
    // Test if we can even get credentials (this handles token fetching errors)
    const { domain } = await (await import("./shopify.server")).getShopifyCredentials();
    
    const data: any = await shopifyGraphQL(`
      query {
        shop { name myshopifyDomain }
        currentAppInstallation { accessScopes { handle description } }
      }
    `);

    if (!data?.shop) {
      throw new Error("Resposta inválida da Shopify: dados da loja não encontrados.");
    }

    const scopesData = data.currentAppInstallation?.accessScopes || [];
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
    
    let errorMessage = error.message;
    if (errorMessage.includes("INVALID_CLIENT_CREDENTIALS")) {
      errorMessage = "Credenciais inválidas. Verifique o Client ID e Client Secret.";
    } else if (errorMessage.includes("SHOP_NOT_FOUND")) {
      errorMessage = "Loja não configurada corretamente no banco de dados.";
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Use a safer update that doesn't rely on specific ID if not found
      await supabaseAdmin
        .from("store_settings")
        .update({ last_sync_error: error.message, sync_status: "error" })
        .order("created_at", { ascending: true })
        .limit(1);
    } catch (dbErr) {
      console.error("Failed to update store settings with error:", dbErr);
    }

    return {
      success: false,
      scopes: [] as string[],
      missingScopes: [] as string[],
      error: error.message,
      message: `Erro ao conectar com a Shopify: ${errorMessage}`,
    };
  }
});