import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Tests the Shopify connection by fetching shop basic info and scopes.
 */
export const testShopifyConnection = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.any().parse(data))
  .handler(async () => {
  try {
    const { shopifyGraphQL, getShopifyCredentials } = await import("./shopify.server");
    
    // First, try to get credentials to check for auth issues
    const { domain } = await getShopifyCredentials();
    
    // Attempt the GraphQL query
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
    
    // Update status in DB
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
      message:
        missingScopes.length > 0
          ? `Conectado, mas faltam scopes: ${missingScopes.join(", ")}`
          : `Conectado à loja ${data.shop.name}.`,
    };
  } catch (error: any) {
    console.error("Connection test error:", error);
    
    let userFriendlyMessage = error.message;
    if (userFriendlyMessage.includes("INVALID_CLIENT_CREDENTIALS")) {
      userFriendlyMessage = "Falha na autenticação. Verifique se o Client ID e Client Secret estão corretos e se o App está instalado na Shopify.";
    } else if (userFriendlyMessage.includes("SHOP_NOT_FOUND")) {
      userFriendlyMessage = "Configurações da loja não encontradas no banco de dados.";
    } else if (userFriendlyMessage.includes("ENOTFOUND") || userFriendlyMessage.includes("fetch failed")) {
      userFriendlyMessage = "Não foi possível alcançar o domínio da Shopify. Verifique se a URL está correta.";
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: existing } = await supabaseAdmin
        .from("store_settings")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existing) {
        await supabaseAdmin
          .from("store_settings")
          .update({ last_sync_error: error.message, sync_status: "error" })
          .eq("id", existing.id);
      }
    } catch (dbErr) {
      console.error("Failed to update status in DB:", dbErr);
    }

    return {
      success: false,
      error: error.message,
      message: userFriendlyMessage,
    };
  }
});