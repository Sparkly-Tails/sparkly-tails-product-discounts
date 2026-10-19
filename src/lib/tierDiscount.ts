import { shopifyQuery } from '@/lib/shopify-client'
import { getRequestShop } from '@/lib/requestShop'
import { METAFIELD_NAMESPACE } from '@/lib/metafieldNames'

/** Must match the `handle` in extensions/product-discount/shopify.extension.toml. */
export const TIER_FUNCTION_HANDLE = 'product-discount'
export const TIER_DISCOUNT_TITLE = 'Product tier discounts'

/**
 * A hidden metafield on the app installation that says "someone is creating the discount right now".
 * It is not one of the stored-data keys, lives only while a creation runs, and goes with the installation.
 */
const CLAIM_KEY = 'tier_discount_claim'
/** A claim older than this is assumed to belong to a caller that died; another caller may take it over. */
export const CLAIM_TIMEOUT_MS = 60_000

/** Admin API refusal code for a write whose compare-and-set precondition no longer holds. */
const LOST_RACE = 'STALE_OBJECT'

interface UserError {
  message: string
  code?: string
}

const messages = (errors: UserError[]): string => errors.map((e) => e.message).join('; ')

/** The automatic app discount the checkout needs. No `combinesWith`: Shopify's default stays. */
export function buildTierDiscountInput(startsAt: string): {
  title: string
  functionHandle: string
  startsAt: string
  discountClasses: ['PRODUCT']
} {
  return { title: TIER_DISCOUNT_TITLE, functionHandle: TIER_FUNCTION_HANDLE, startsAt, discountClasses: ['PRODUCT'] }
}

async function findTierFunctionId(shop: string): Promise<string> {
  const data = await shopifyQuery<{ shopifyFunctions: { nodes: { id: string; handle: string }[] } }>(
    `query { shopifyFunctions(first: 25) { nodes { id handle } } }`,
    undefined,
    shop,
  )
  const found = data.shopifyFunctions.nodes.find((fn) => fn.handle === TIER_FUNCTION_HANDLE)
  if (!found) throw new Error(`The tier discount Function "${TIER_FUNCTION_HANDLE}" is not deployed for this app`)
  return found.id
}

/**
 * True when the store already has an automatic app discount of this Function, in any state. This uses
 * `discountNodes`: `automaticDiscountNodes` lists only Shopify's own discounts, not app discounts.
 */
async function tierDiscountExists(shop: string, functionId: string): Promise<boolean> {
  type Page = {
    discountNodes: {
      nodes: { discount: { __typename: string; appDiscountType?: { functionId: string } } }[]
      pageInfo: { hasNextPage: boolean; endCursor: string | null }
    }
  }
  let after: string | null = null
  for (;;) {
    const data: Page = await shopifyQuery<Page>(
      `query tierDiscounts($after: String) {
        discountNodes(first: 100, after: $after, query: "type:app") {
          nodes { discount { __typename ... on DiscountAutomaticApp { appDiscountType { functionId } } } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { after },
      shop,
    )
    const { nodes, pageInfo } = data.discountNodes
    if (nodes.some((node) => node.discount.__typename === 'DiscountAutomaticApp' && node.discount.appDiscountType?.functionId === functionId)) return true
    if (!pageInfo.hasNextPage || !pageInfo.endCursor) return false
    after = pageInfo.endCursor
  }
}

async function writeClaim(shop: string, installationId: string, value: string, compareDigest: string | null): Promise<'won' | 'lost'> {
  const data = await shopifyQuery<{ metafieldsSet: { userErrors: UserError[] } }>(
    `mutation claimTierDiscount($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) { userErrors { field message code } }
    }`,
    { metafields: [{ ownerId: installationId, namespace: METAFIELD_NAMESPACE, key: CLAIM_KEY, type: 'single_line_text_field', value, compareDigest }] },
    shop,
  )
  const { userErrors } = data.metafieldsSet
  if (userErrors.length === 0) return 'won'
  if (userErrors.every((e) => e.code === LOST_RACE)) return 'lost'
  throw new Error(messages(userErrors))
}

/**
 * Takes the claim if nobody holds it, or takes over one that has gone stale. Both are compare-and-set
 * writes, so when several callers try at once Shopify lets exactly one of them win.
 */
async function claimCreation(shop: string, now: number): Promise<'won' | 'lost'> {
  const data = await shopifyQuery<{ currentAppInstallation: { id: string; metafield: { value: string; compareDigest: string | null } | null } }>(
    `query currentClaim($namespace: String!, $key: String!) {
      currentAppInstallation { id metafield(namespace: $namespace, key: $key) { value compareDigest } }
    }`,
    { namespace: METAFIELD_NAMESPACE, key: CLAIM_KEY },
    shop,
  )
  const { id, metafield } = data.currentAppInstallation
  const claimedAt = new Date(now).toISOString()
  if (!metafield) return writeClaim(shop, id, claimedAt, null)

  const heldSince = Date.parse(metafield.value)
  const stale = Number.isNaN(heldSince) || now - heldSince > CLAIM_TIMEOUT_MS
  if (!stale || !metafield.compareDigest) return 'lost'
  return writeClaim(shop, id, claimedAt, metafield.compareDigest)
}

async function releaseClaim(shop: string): Promise<void> {
  const data = await shopifyQuery<{ currentAppInstallation: { id: string } }>(`query { currentAppInstallation { id } }`, undefined, shop)
  await shopifyQuery(
    `mutation releaseTierDiscountClaim($metafields: [MetafieldIdentifierInput!]!) {
      metafieldsDelete(metafields: $metafields) { userErrors { message } }
    }`,
    { metafields: [{ ownerId: data.currentAppInstallation.id, namespace: METAFIELD_NAMESPACE, key: CLAIM_KEY }] },
    shop,
  )
}

async function createTierDiscount(shop: string, startsAt: string): Promise<void> {
  const data = await shopifyQuery<{
    discountAutomaticAppCreate: { automaticAppDiscount: { discountId: string } | null; userErrors: UserError[] }
  }>(
    `mutation createTierDiscount($automaticAppDiscount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
        automaticAppDiscount { discountId }
        userErrors { field message }
      }
    }`,
    { automaticAppDiscount: buildTierDiscountInput(startsAt) },
    shop,
  )
  const { automaticAppDiscount, userErrors } = data.discountAutomaticAppCreate
  if (userErrors.length > 0) throw new Error(messages(userErrors))
  if (!automaticAppDiscount) throw new Error('Shopify did not return the created tier discount')
}

/**
 * Makes sure the store has the tier checkout discount, creating it once when it has none. An existing
 * discount of the Function is never changed, whatever its state. Safe to call from several tabs at
 * once: only the caller that wins the claim creates, and it looks again after winning because another
 * caller may have finished between its first look and its claim.
 * 'exists' also covers "another caller is creating it right now".
 */
export async function ensureTierDiscount(explicitShop?: string): Promise<'created' | 'exists'> {
  const shop = await getRequestShop(explicitShop)
  const now = Date.now()

  const functionId = await findTierFunctionId(shop)
  if (await tierDiscountExists(shop, functionId)) return 'exists'
  if ((await claimCreation(shop, now)) === 'lost') return 'exists'

  try {
    if (await tierDiscountExists(shop, functionId)) return 'exists'
    await createTierDiscount(shop, new Date(now).toISOString())
    return 'created'
  } finally {
    await releaseClaim(shop).catch((error: unknown) => {
      console.log(`Could not release the tier discount claim for ${shop}: ${error instanceof Error ? error.message : 'unknown error'}`)
    })
  }
}

/** For the home page, which must never be blocked: logs the reason and answers 'failed'. */
export async function ensureTierDiscountSafely(explicitShop?: string): Promise<'created' | 'exists' | 'failed'> {
  try {
    return await ensureTierDiscount(explicitShop)
  } catch (error) {
    console.log(`Could not make sure the tier discount exists: ${error instanceof Error ? error.message : 'unknown error'}`)
    return 'failed'
  }
}
