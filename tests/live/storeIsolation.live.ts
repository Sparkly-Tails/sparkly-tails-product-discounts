import { describe, it, expect, vi, afterAll } from 'vitest'
import { compareStoreSnapshots, type StoreSnapshot } from '../../scripts/storeIsolation'
import { METAFIELD_NAMESPACE } from '@/lib/metafieldNames'
import { getRequestShop } from '@/lib/requestShop'
import { TIER_FUNCTION_HANDLE } from '@/lib/tierDiscount'

/**
 * Runs the real `ensureTierDiscount` against two real dev stores. Started by
 * `npm run check:isolation -- <store A> <store B>`, which passes the two stores and one short-lived
 * token for each in ISOLATION_STORES (JSON). Nothing here prints a token or a secret.
 */
const stores: { shop: string; token: string }[] = JSON.parse(process.env.ISOLATION_STORES ?? '[]')
const tokens = new Map(stores.map((store) => [store.shop, store.token]))
const API_VERSION = '2025-10'
const MARKER_KEY = 'isolation_marker'

vi.mock('@/lib/shopify-client', () => ({
  // The same call the app makes, with the token of the shop it is for (never a global shop).
  shopifyQuery: async (query: string, variables: Record<string, unknown> | undefined, shop: string) => {
    const response = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': tokens.get(shop) ?? '' },
      body: JSON.stringify({ query, variables }),
    })
    const json = (await response.json()) as { data?: unknown; errors?: unknown }
    if (json.errors) throw new Error(JSON.stringify(json.errors))
    return json.data
  },
}))

const { shopifyQuery } = await import('@/lib/shopify-client')
const { ensureTierDiscount } = await import('@/lib/tierDiscount')

const ask = <T>(shop: string, query: string, variables?: Record<string, unknown>) => shopifyQuery<T>(query, variables, shop)

async function snapshot(shop: string): Promise<StoreSnapshot> {
  const functions = await ask<{ shopifyFunctions: { nodes: { id: string; handle: string }[] } }>(shop, `query { shopifyFunctions(first: 25) { nodes { id handle } } }`)
  const tierFunctionId = functions.shopifyFunctions.nodes.find((fn) => fn.handle === TIER_FUNCTION_HANDLE)?.id

  const discountIds: string[] = []
  let tierDiscountCount = 0
  let after: string | null = null
  for (;;) {
    type Page = { discountNodes: { nodes: { id: string; discount: { __typename: string; appDiscountType?: { functionId: string } } }[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }
    const page: Page = await ask<Page>(shop, `query($after: String) { discountNodes(first: 100, after: $after, query: "type:app") { nodes { id discount { __typename ... on DiscountAutomaticApp { appDiscountType { functionId } } } } pageInfo { hasNextPage endCursor } } }`, { after })
    for (const node of page.discountNodes.nodes) {
      if (node.discount.__typename !== 'DiscountAutomaticApp') continue
      discountIds.push(node.id)
      if (node.discount.appDiscountType?.functionId === tierFunctionId) tierDiscountCount += 1
    }
    if (!page.discountNodes.pageInfo.hasNextPage) break
    after = page.discountNodes.pageInfo.endCursor
  }

  const marker = await ask<{ shop: { metafield: { value: string } | null } }>(shop, `query($namespace: String!, $key: String!) { shop { metafield(namespace: $namespace, key: $key) { value } } }`, { namespace: METAFIELD_NAMESPACE, key: MARKER_KEY })
  return { shop, marker: marker.shop.metafield?.value ?? null, discountIds, tierDiscountCount }
}

async function setMarker(shop: string, value: string): Promise<void> {
  const owner = await ask<{ shop: { id: string } }>(shop, `query { shop { id } }`)
  const result = await ask<{ metafieldsSet: { userErrors: { message: string }[] } }>(shop, `mutation($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { message } } }`, {
    metafields: [{ ownerId: owner.shop.id, namespace: METAFIELD_NAMESPACE, key: MARKER_KEY, type: 'single_line_text_field', value }],
  })
  if (result.metafieldsSet.userErrors.length) throw new Error(result.metafieldsSet.userErrors.map((e) => e.message).join('; '))
}

async function clearMarker(shop: string): Promise<void> {
  const owner = await ask<{ shop: { id: string } }>(shop, `query { shop { id } }`)
  await ask(shop, `mutation($metafields: [MetafieldIdentifierInput!]!) { metafieldsDelete(metafields: $metafields) { userErrors { message } } }`, {
    metafields: [{ ownerId: owner.shop.id, namespace: METAFIELD_NAMESPACE, key: MARKER_KEY }],
  })
}

describe.skipIf(stores.length !== 2)('two dev stores stay isolated', () => {
  const [a, b] = stores.map((store) => store.shop)

  afterAll(async () => {
    await clearMarker(a)
  })

  it('refuses a shop that is not a real shop host before touching Shopify', async () => {
    await expect(getRequestShop('not-a-shop.example.com')).rejects.toThrow('No shop for this request')
  })

  it('keeps each store to its own data and gives each exactly one tier discount', async () => {
    await setMarker(a, `isolation-${Date.now()}`)

    // Four callers at once: two per store.
    const outcomes = await Promise.all([ensureTierDiscount(a), ensureTierDiscount(a), ensureTierDiscount(b), ensureTierDiscount(b)])

    const [snapshotA, snapshotB] = await Promise.all([snapshot(a), snapshot(b)])
    const violations = compareStoreSnapshots(snapshotA, snapshotB)

    console.log(
      `isolation check: ${a} (${snapshotA.discountIds.length} app discounts, ${snapshotA.tierDiscountCount} tier), ` +
        `${b} (${snapshotB.discountIds.length} app discounts, ${snapshotB.tierDiscountCount} tier); ` +
        `ensureTierDiscount results: ${outcomes.join(', ')}; ${violations.length} violations`,
    )
    for (const violation of violations) console.log(`VIOLATION: ${violation}`)
    expect(violations).toEqual([])
  })
})
