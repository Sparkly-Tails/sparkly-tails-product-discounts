import { shopifyQuery } from '@/lib/shopify-client'

export interface CollectionSearchResult {
  id: string
  title: string
}

/** Search-as-you-type lookup for the Collections-mode picker. */
export async function searchCollections(query: string): Promise<CollectionSearchResult[]> {
  if (!query.trim()) return []

  const data = await shopifyQuery<{
    collections: { edges: { node: { id: string; title: string } }[] }
  }>(
    `query searchCollections($q: String!) {
      collections(first: 8, query: $q) {
        edges { node { id title } }
      }
    }`,
    { q: query },
  )

  return data.collections.edges.map((e) => ({ id: e.node.id, title: e.node.title }))
}

/**
 * Enumerates every product currently in the given collections, deduped
 * across collections, paginating past Shopify's 250-per-page limit. Used
 * to resolve a Collections-mode time discount's members at save time (see
 * spec §3, §5) — the Function never queries collections itself. Whole-
 * product members only (no variantId): collection membership is per-
 * product, not per-variant.
 */
export async function resolveCollectionMembers(collectionIds: string[]): Promise<{ productId: string }[]> {
  const seen = new Set<string>()
  const results: { productId: string }[] = []

  for (const collectionId of collectionIds) {
    let cursor: string | null = null
    for (;;) {
      const data: {
        collection: {
          products: { edges: { node: { id: string } }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }
        } | null
      } = await shopifyQuery(
        `query getCollectionProducts($id: ID!, $after: String) {
          collection(id: $id) {
            products(first: 250, after: $after) {
              edges { node { id } }
              pageInfo { hasNextPage endCursor }
            }
          }
        }`,
        { id: collectionId, after: cursor },
      )

      if (!data.collection) break

      for (const edge of data.collection.products.edges) {
        if (!seen.has(edge.node.id)) {
          seen.add(edge.node.id)
          results.push({ productId: edge.node.id })
        }
      }

      if (!data.collection.products.pageInfo.hasNextPage) break
      cursor = data.collection.products.pageInfo.endCursor
    }
  }

  return results
}
