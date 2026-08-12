import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const SHOPIFY_API_VERSION = "2025-01";

/** RPC wrapper — server code must import getShopifyCredentials from ./shopify.server instead. */
export const getShopifyAdminCredentials = createServerFn({ method: "GET" }).handler(async () => {
  const { getShopifyCredentials } = await import("./shopify.server");
  return getShopifyCredentials();
});

const shopifyQuerySchema = z.object({
  query: z.string(),
  variables: z.record(z.any()).optional(),
});

/** RPC wrapper — server code must import shopifyGraphQL from ./shopify.server instead. */
export const shopifyQuery = createServerFn({ method: "POST" })
  .validator((data: unknown) => shopifyQuerySchema.parse(data))
  .handler(async ({ data }) => {
    const { shopifyGraphQL } = await import("./shopify.server");
    return shopifyGraphQL(data.query, data.variables);
  });
