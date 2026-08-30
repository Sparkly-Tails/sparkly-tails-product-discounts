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

export interface MemberInfo {
  productId: string
  variantId?: string
  title: string
  price: number
  handle: string
  imageUrl: string | null
}

/**
 * Batch title/price/handle/image lookup for a discount's members. Silently
 * skips any member whose product no longer resolves, mirroring the old
 * per-product lookups' null-on-missing behavior — a stale id shouldn't take
 * down the whole discount's admin page.
 */
export async function getMemberInfo(
  members: { productId: string; variantId?: string }[],
): Promise<MemberInfo[]> {
  if (members.length === 0) return []

  const productIds = [...new Set(members.map((m) => m.productId))]

  const data = await shopifyQuery<{
    nodes: ({
      id: string
      title: string
      handle: string
      featuredImage: { url: string } | null
      variants: { edges: { node: { id: string; title: string; price: string } }[] }
    } | null)[]
  }>(
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
    { ids: productIds },
  )

  const productById = new Map(data.nodes.filter((n) => n != null).map((n) => [n!.id, n!]))

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
