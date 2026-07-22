import { shopifyQuery } from '@/lib/shopify-client'

export interface ProductSearchResult {
  id: string
  title: string
}

/**
 * Search-as-you-type lookup for the product picker. Empty/whitespace query
 * short-circuits to no results without a network call, matching the
 * picker's debounce.
 */
export async function searchProducts(query: string): Promise<ProductSearchResult[]> {
  if (!query.trim()) return []

  const data = await shopifyQuery<{
    products: { edges: { node: { id: string; title: string } }[] }
  }>(
    `query searchProducts($q: String!) {
      products(first: 8, query: $q) {
        edges { node { id title } }
      }
    }`,
    { q: query },
  )

  return data.products.edges.map((e) => e.node)
}

export interface ProductInfo {
  title: string
  basePrice: number
}

/**
 * Fetches a product's title and real base price (the first variant's
 * price). Assumes a single-variant product, consistent with this app's
 * per-product tier scoping. Returns null if the product doesn't exist or
 * has no variants, so callers can skip a stale product id rather than crash.
 */
export async function getProductInfo(productId: string): Promise<ProductInfo | null> {
  const data = await shopifyQuery<{
    product: {
      title: string
      variants: { edges: { node: { price: string } }[] }
    } | null
  }>(
    `query getProductInfo($id: ID!) {
      product(id: $id) {
        title
        variants(first: 1) {
          edges { node { price } }
        }
      }
    }`,
    { id: productId },
  )

  if (!data.product) return null
  const firstVariant = data.product.variants.edges[0]?.node
  if (!firstVariant) return null

  return {
    title: data.product.title,
    basePrice: parseFloat(firstVariant.price),
  }
}
