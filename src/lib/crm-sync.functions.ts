import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";


const syncInput = z.object({
  fullSync: z.boolean().optional().default(false),
});

// Note: the custom app has read_orders / read_all_orders but NOT read_customers,
// so the `customer { ... }` field is unavailable. Customer identity is derived
// from the order email + shipping address instead.
const ORDERS_QUERY = `
  query getOrders($cursor: String, $query: String) {
    orders(first: 50, after: $cursor, sortKey: UPDATED_AT, reverse: false, query: $query) {
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
          shippingAddress { name firstName lastName city province country }
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

export const syncShopifyData = createServerFn({ method: "POST" })
  .validator((data: unknown) => syncInput.parse(data))
  .handler(async ({ data: { fullSync } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { shopifyGraphQL } = await import("./shopify.server");

    const { data: settings } = await supabaseAdmin
      .from("store_settings")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!settings) throw new Error("Store settings not found");

    await supabaseAdmin
      .from("store_settings")
      .update({ sync_status: "syncing", last_sync_error: null })
      .eq("id", settings.id);

    try {
      let cursor: string | null = null;
      let hasNextPage = true;
      let totalImported = 0;
      let lastUpdatedAt: string | null = null;

      // Incremental sync: only orders updated after the last successful sync.
      const searchQuery =
        !fullSync && settings.last_sync_at
          ? `updated_at:>='${new Date(settings.last_sync_at).toISOString()}'`
          : null;

      while (hasNextPage) {
        const result: any = await shopifyGraphQL(ORDERS_QUERY, { cursor, query: searchQuery });
        const ordersConnection = result.orders;

        for (const edge of ordersConnection.edges) {
          const order = edge.node;
          const addr = order.shippingAddress;
          const email: string | null = order.email || null;
          const customerId = email ? `email:${email.toLowerCase()}` : null;

          if (customerId) {
            const fullName =
              addr?.name || [addr?.firstName, addr?.lastName].filter(Boolean).join(" ") || null;
            await supabaseAdmin.from("shopify_customers").upsert({
              id: customerId,
              email,
              first_name: addr?.firstName ?? fullName?.split(" ")[0] ?? null,
              last_name: addr?.lastName ?? fullName?.split(" ").slice(1).join(" ") ?? null,
              phone: order.phone ?? null,
              city: addr?.city ?? null,
              province: addr?.province ?? null,
              country: addr?.country ?? null,
              updated_at: new Date().toISOString(),
            });
          }

          await supabaseAdmin.from("shopify_orders").upsert({
            id: order.id,
            order_number: order.name,
            customer_id: customerId,
            email,
            phone: order.phone,
            created_at: order.createdAt,
            processed_at: order.processedAt,
            updated_at: order.updatedAt,
            financial_status: order.displayFinancialStatus,
            fulfillment_status: order.displayFulfillmentStatus,
            currency_code: order.currencyCode,
            subtotal_price: parseFloat(order.subtotalPriceSet?.presentmentMoney?.amount ?? "0"),
            total_discounts: parseFloat(order.totalDiscountsSet?.presentmentMoney?.amount ?? "0"),
            total_shipping_price: parseFloat(order.totalShippingPriceSet?.presentmentMoney?.amount ?? "0"),
            total_tax: parseFloat(order.totalTaxSet?.presentmentMoney?.amount ?? "0"),
            total_price: parseFloat(order.totalPriceSet?.presentmentMoney?.amount ?? "0"),
            source_name: order.sourceName,
            landing_site: null,
            referring_site: null,
            city: addr?.city ?? null,
            province: addr?.province ?? null,
            country: addr?.country ?? null,
            raw_data: order,
          });

          for (const liEdge of order.lineItems.edges) {
            const li = liEdge.node;
            await supabaseAdmin.from("shopify_order_items").upsert({
              id: li.id,
              order_id: order.id,
              product_id: null,
              variant_id: null,
              title: li.title,
              variant_title: li.variantTitle,
              sku: li.sku,
              quantity: li.quantity,
              price: parseFloat(li.discountedUnitPriceSet?.presentmentMoney?.amount ?? "0"),
              total_discount: parseFloat(li.totalDiscountSet?.presentmentMoney?.amount ?? "0"),
            });
          }

          for (const f of order.fulfillments ?? []) {
            await supabaseAdmin.from("shopify_fulfillments").upsert({
              id: f.id,
              order_id: order.id,
              status: f.status,
              created_at: f.createdAt,
              updated_at: f.updatedAt,
              tracking_company: f.trackingInfo?.[0]?.company ?? null,
              tracking_number: f.trackingInfo?.[0]?.number ?? null,
              tracking_url: f.trackingInfo?.[0]?.url ?? null,
              raw_data: f,
            });
          }

          lastUpdatedAt = order.updatedAt;
          totalImported++;
        }

        hasNextPage = ordersConnection.pageInfo.hasNextPage;
        cursor = ordersConnection.pageInfo.endCursor;

        if (totalImported > 5000) break;
      }

      await supabaseAdmin
        .from("store_settings")
        .update({
          sync_status: "connected",
          last_sync_at: new Date().toISOString(),
          last_sync_error: null,
          total_orders_imported: totalImported,
          last_imported_order_at: lastUpdatedAt,
        })
        .eq("id", settings.id);

      return { success: true, totalImported };
    } catch (error: any) {
      console.error("Sync failed:", error);
      await supabaseAdmin
        .from("store_settings")
        .update({ sync_status: "error", last_sync_error: error.message })
        .eq("id", settings.id);
      throw error;
    }
  });
