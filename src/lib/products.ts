import { shopifyQuery } from '@/lib/shopify-client'

export interface ProductSearchResult {
  id: string
  title: string
  variantCount: number
}

/**
 * Search-as-you-type lookup for the member picker. Empty/whitespace query
 * short-circuits to no results without a network call, matching the
 * picker's debounce. variantCount tells the picker whether to offer the
 * "select specific variants" expansion.
 */
export async function searchProducts(query: string): Promise<ProductSearchResult[]> {
  if (!query.trim()) return []

  const data = await shopifyQuery<{
    products: { edges: { node: { id: string; title: string; variants: { edges: { node: object }[] } } }[] }
  }>(
    `query searchProducts($q: String!) {
      products(first: 8, query: $q) {
        edges { node { id title variants(first: 250) { edges { node { id } } } } }
      }
    }`,
    { q: query },
  )

  return data.products.edges.map((e) => ({
    id: e.node.id,
    title: e.node.title,
    variantCount: e.node.variants.edges.length,
  }))
}

export interface ProductVariantOption {
  variantId: string
  title: string
  price: number
}

/** Lists every variant of a product, for the picker's variant-expansion UI. */
export async function getProductVariantOptions(productId: string): Promise<ProductVariantOption[]> {
  const data = await shopifyQuery<{
    product: {
      variants: { edges: { node: { id: string; title: string; price: string } }[] }
    } | null
  }>(
    `query getProductVariantOptions($id: ID!) {
      product(id: $id) {
        variants(first: 250) {
          edges { node { id title price } }
        }
      }
    }`,
    { id: productId },
  )

  if (!data.product) return []
  return data.product.variants.edges.map((e) => ({
    variantId: e.node.id,
    title: e.node.title,
    price: parseFloat(e.node.price),
  }))
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

export interface MemberInfo {
  productId: string
  variantId?: string
  title: string
  price: number
  handle: string
  imageUrl: string | null
}

/** Shopify's GraphQL API caps list-argument variables (like `nodes(ids:)`) at 250 items. */
const NODES_QUERY_CHUNK_SIZE = 250

type MemberInfoProductNode = {
  id: string
  title: string
  handle: string
  featuredImage: { url: string } | null
  variants: { edges: { node: { id: string; title: string; price: string } }[] }
} | null

/**
 * Batch title/price/handle/image lookup for a discount's members. Silently
 * skips any member whose product no longer resolves, mirroring the old
 * per-product lookups' null-on-missing behavior — a stale id shouldn't take
 * down the whole discount's admin page. Batches the `nodes(ids:)` lookup in
 * chunks of 250 (Shopify's list-argument cap) and merges the results.
 */
export async function getMemberInfo(
  members: { productId: string; variantId?: string }[],
): Promise<MemberInfo[]> {
  if (members.length === 0) return []

  const productIds = [...new Set(members.map((m) => m.productId))]

  const idChunks = chunk(productIds, NODES_QUERY_CHUNK_SIZE)
  const chunkResults = await Promise.all(
    idChunks.map((ids) =>
      shopifyQuery<{ nodes: MemberInfoProductNode[] }>(
        `query getMemberInfo($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              handle
              featuredImage { url }
              variants(first: 250) {
                edges { node { id title price } }
              }
            }
          }
        }`,
        { ids },
      ),
    ),
  )
  const allNodes = chunkResults.flatMap((data) => data.nodes)

  const productById = new Map(allNodes.filter((n) => n != null).map((n) => [n!.id, n!]))

  const results: MemberInfo[] = []
  for (const member of members) {
    const product = productById.get(member.productId)
    if (!product) continue

    if (member.variantId == null) {
      const firstVariant = product.variants.edges[0]?.node
      if (!firstVariant) continue
      results.push({
        productId: product.id,
        variantId: undefined,
        title: product.title,
        price: parseFloat(firstVariant.price),
        handle: product.handle,
        imageUrl: product.featuredImage?.url ?? null,
      })
      continue
    }

    const variant = product.variants.edges.find((e) => e.node.id === member.variantId)?.node
    if (!variant) continue
    results.push({
      productId: product.id,
      variantId: variant.id,
      title: `${product.title} – ${variant.title}`,
      price: parseFloat(variant.price),
      handle: product.handle,
      imageUrl: product.featuredImage?.url ?? null,
    })
  }
  return results
}

export interface LowestPrice {
  productId: string
  title: string
  price: number
}

/**
 * Each product's title and its LOWEST variant price, in one batched lookup
 * (chunks of 250, Shopify's list-argument cap). A whole-product discount row
 * applies to every variant, so a fixed price has to be judged against the
 * cheapest one; `getMemberInfo` cannot do that, it returns the first variant's
 * price. A product that no longer resolves, or has no variants, is left out.
 */
export async function getLowestVariantPrices(productIds: string[]): Promise<LowestPrice[]> {
  const unique = [...new Set(productIds)]
  if (unique.length === 0) return []

  const responses = await Promise.all(
    chunk(unique, NODES_QUERY_CHUNK_SIZE).map((ids) =>
      shopifyQuery<{
        nodes: ({ id: string; title: string; variants: { edges: { node: { price: string } }[] } } | null)[]
      }>(
        `query getLowestVariantPrices($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Product {
              id
              title
              variants(first: 250) { edges { node { price } } }
            }
          }
        }`,
        { ids },
      ),
    ),
  )

  return responses
    .flatMap((response) => response.nodes)
    .flatMap((node) =>
      node && node.variants.edges.length > 0
        ? [{ productId: node.id, title: node.title, price: Math.min(...node.variants.edges.map((e) => parseFloat(e.node.price))) }]
        : [],
    )
}
