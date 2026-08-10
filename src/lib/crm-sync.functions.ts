import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { shopifyQuery } from "./shopify.functions";

const syncInput = z.object({
  fullSync: z.boolean().optional().default(false),
});

export const syncShopifyData = createServerFn({ method: "POST" })
  .validator((data: unknown) => syncInput.parse(data))
  .handler(async ({ data: { fullSync } }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    // 1. Get settings
    const { data: settings } = await supabaseAdmin
      .from("store_settings")
      .select("*")
      .single();

    if (!settings) throw new Error("Store settings not found");

    await supabaseAdmin
      .from("store_settings")
      .update({ sync_status: "syncing", last_sync_error: null })
      .eq("id", settings.id);

    try {
      let cursor: string | null = null;
      let hasNextPage = true;
      let totalImported = 0;
      
      // If not full sync, we could use a query filter like updated_at:>'YYYY-MM-DD'
      // For now, let's implement the robust pagination
      
      while (hasNextPage) {
        const query = `
          query getOrders($cursor: String) {
            orders(first: 50, after: $cursor, sortKey: UPDATED_AT, reverse: false) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  id
                  name
                  createdAt
                  processedAt
                  updatedAt
                  financialStatus
                  fulfillmentStatus
                  currencyCode
                  subtotalPriceSet { presentmentMoney { amount } }
                  totalDiscountsSet { presentmentMoney { amount } }
                  totalShippingPriceSet { presentmentMoney { amount } }
                  totalTaxSet { presentmentMoney { amount } }
                  totalPriceSet { presentmentMoney { amount } }
                  sourceName
                  landingSite
                  referringSite
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
                    }
                  }
                  lineItems(first: 50) {
                    edges {
                      node {
                        id
                        product { id }
                        variant { id title sku }
                        title
                        quantity
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
                    trackingInfo(first: 1) {
                      company
                      number
                      url
                    }
                  }
                }
              }
            }
          }
        `;

        const result = await shopifyQuery({ data: { query, variables: { cursor } } });
        const ordersConnection = result.orders;
        const edges = ordersConnection.edges;

        for (const edge of edges) {
          const order = edge.node;
          
          // Upsert Customer
          if (order.customer) {
            const cust = order.customer;
            await supabaseAdmin.from("shopify_customers").upsert({
              id: cust.id,
              email: cust.email,
              first_name: cust.firstName,
              last_name: cust.lastName,
              phone: cust.phone,
              city: cust.defaultAddress?.city,
              province: cust.defaultAddress?.province,
              country: cust.defaultAddress?.country,
              updated_at: new Date().toISOString()
            });
          }

          // Upsert Order
          await supabaseAdmin.from("shopify_orders").upsert({
            id: order.id,
            order_number: order.name,
            customer_id: order.customer?.id,
            email: order.email || order.customer?.email,
            phone: order.phone || order.customer?.phone,
            created_at: order.createdAt,
            processed_at: order.processedAt,
            updated_at: order.updatedAt,
            financial_status: order.financialStatus,
            fulfillment_status: order.fulfillmentStatus,
            currency_code: order.currencyCode,
            subtotal_price: parseFloat(order.subtotalPriceSet.presentmentMoney.amount),
            total_discounts: parseFloat(order.totalDiscountsSet.presentmentMoney.amount),
            total_shipping_price: parseFloat(order.totalShippingPriceSet.presentmentMoney.amount),
            total_tax: parseFloat(order.totalTaxSet.presentmentMoney.amount),
            total_price: parseFloat(order.totalPriceSet.presentmentMoney.amount),
            source_name: order.sourceName,
            landing_site: order.landingSite,
            referring_site: order.referringSite,
            city: order.customer?.defaultAddress?.city,
            province: order.customer?.defaultAddress?.province,
            country: order.customer?.defaultAddress?.country,
            raw_data: order
          });

          // Line Items
          for (const liEdge of order.lineItems.edges) {
            const li = liEdge.node;
            await supabaseAdmin.from("shopify_order_items").upsert({
              id: li.id,
              order_id: order.id,
              product_id: li.product?.id,
              variant_id: li.variant?.id,
              title: li.title,
              variant_title: li.variant?.title,
              sku: li.variant?.sku,
              quantity: li.quantity,
              price: parseFloat(li.discountedUnitPriceSet.presentmentMoney.amount),
              total_discount: parseFloat(li.totalDiscountSet.presentmentMoney.amount)
            });
          }

          // Fulfillments
          for (const f of order.fulfillments) {
            await supabaseAdmin.from("shopify_fulfillments").upsert({
              id: f.id,
              order_id: order.id,
              status: f.status,
              created_at: f.createdAt,
              updated_at: f.updatedAt,
              tracking_company: f.trackingInfo[0]?.company,
              tracking_number: f.trackingInfo[0]?.number,
              tracking_url: f.trackingInfo[0]?.url,
              raw_data: f
            });
          }
          
          totalImported++;
        }

        hasNextPage = ordersConnection.pageInfo.hasNextPage;
        cursor = ordersConnection.pageInfo.endCursor;
        
        // Safety break for testing or huge stores without background workers
        if (totalImported > 1000 && !fullSync) break; 
      }

      await supabaseAdmin.from("store_settings").update({
        sync_status: "idle",
        last_sync_at: new Date().toISOString(),
        total_orders_imported: totalImported
      }).eq("id", settings.id);

      return { success: true, totalImported };
    } catch (error: any) {
      console.error("Sync failed:", error);
      await supabaseAdmin.from("store_settings").update({
        sync_status: "error",
        last_sync_error: error.message
      }).eq("id", settings.id);
      throw error;
    }
  });
