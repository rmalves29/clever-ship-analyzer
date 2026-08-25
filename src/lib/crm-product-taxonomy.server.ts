import { shopifyGraphQL } from "./shopify.server";

export type ShopifyProductCollection = {
  id: string;
  title: string;
  handle: string | null;
};

export type ShopifyProductTaxonomy = {
  id: string;
  title: string;
  productType: string | null;
  collections: ShopifyProductCollection[];
};

type CacheEntry = { value: ShopifyProductTaxonomy; expiresAt: number };
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000;
const BATCH_SIZE = 50;

const TAXONOMY_QUERY = `
  query crmProductTaxonomy($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        productType
        collections(first: 50) {
          nodes { id title handle }
        }
      }
    }
  }
`;

function fromNode(node: any): ShopifyProductTaxonomy | null {
  if (!node?.id) return null;
  return {
    id: String(node.id),
    title: String(node.title ?? "Produto"),
    productType: String(node.productType ?? "").trim() || null,
    collections: (node.collections?.nodes ?? [])
      .filter((collection: any) => collection?.id && collection?.title)
      .map((collection: any) => ({
        id: String(collection.id),
        title: String(collection.title),
        handle: collection.handle ? String(collection.handle) : null,
      })),
  };
}

/**
 * Resolve tipo/categoria e coleções atuais dos produtos na Shopify.
 * Usa cache curto em memória para o editor/listagens do CRM não consultarem
 * a Admin API a cada renderização. Falhas de um lote não derrubam o CRM:
 * produtos daquele lote ficam simplesmente sem taxonomia até a próxima tentativa.
 */
export async function getShopifyProductTaxonomyByIds(productIds: string[]): Promise<Map<string, ShopifyProductTaxonomy>> {
  const ids = [...new Set(productIds.map((id) => String(id).trim()).filter(Boolean))];
  const result = new Map<string, ShopifyProductTaxonomy>();
  const now = Date.now();
  const missing: string[] = [];

  for (const id of ids) {
    const cached = CACHE.get(id);
    if (cached && cached.expiresAt > now) result.set(id, cached.value);
    else missing.push(id);
  }

  for (let start = 0; start < missing.length; start += BATCH_SIZE) {
    const batch = missing.slice(start, start + BATCH_SIZE);
    try {
      const data = await shopifyGraphQL(TAXONOMY_QUERY, { ids: batch });
      for (const node of data?.nodes ?? []) {
        const taxonomy = fromNode(node);
        if (!taxonomy) continue;
        result.set(taxonomy.id, taxonomy);
        CACHE.set(taxonomy.id, { value: taxonomy, expiresAt: now + CACHE_TTL_MS });
      }
    } catch (error) {
      console.error("Falha ao carregar taxonomia Shopify para o CRM:", error);
    }
  }

  return result;
}
