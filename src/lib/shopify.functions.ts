import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "./app-auth";
import { z } from "zod";

export const SHOPIFY_API_VERSION = "2025-01";

/** RPC wrapper — server code must import getShopifyCredentials from ./shopify.server instead. */
export const getShopifyAdminCredentials = createServerFn({ method: "GET" })
  .middleware([requireAppAuth]).handler(async () => {
  const { getShopifyCredentials } = await import("./shopify.server");
  return getShopifyCredentials();
});

const shopifyQuerySchema = z.object({
  query: z.string(),
  variables: z.record(z.any()).optional(),
});

/** RPC wrapper — server code must import shopifyGraphQL from ./shopify.server instead. */
export const shopifyQuery = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((data: unknown) => shopifyQuerySchema.parse(data))
  .handler(async ({ data }) => {
    const { shopifyGraphQL } = await import("./shopify.server");
    return shopifyGraphQL(data.query, data.variables);
  });
