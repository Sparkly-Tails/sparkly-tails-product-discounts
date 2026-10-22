// The Shopify automatic discount of one flash sale. It runs the same tier
// Function as the shared "Product tier discounts" discount, but with its own
// start and end, so Shopify itself turns the sale on and off. Its only config
// is the id of the tier discount it applies. Copied from the time-based
// discount's record code (which will be removed); nothing imports from it.
import type { shopifyQuery } from '@/lib/shopify-client'
import { METAFIELD_KEYS, METAFIELD_NAMESPACE } from '@/lib/metafieldNames'

/** Must match the `handle` in extensions/product-discount/shopify.extension.toml. */
const TIER_FUNCTION_HANDLE = 'product-discount'

export type ShopifyQuery = typeof shopifyQuery

interface UserError {
  field: string[]
  message: string
}

export interface FlashRecordInput {
  title: string
  functionHandle: string
  discountClasses: ['PRODUCT']
  startsAt: string
  endsAt: string
  combinesWith: { productDiscounts: true }
  metafields: { namespace: string; key: string; type: string; value: string }[]
}

export function buildFlashRecordInput({ title, discountId, startsAtUtc, endsAtUtc }: {
  title: string
  discountId: string
  startsAtUtc: string
  endsAtUtc: string
}): FlashRecordInput {
  return {
    title,
    functionHandle: TIER_FUNCTION_HANDLE,
    discountClasses: ['PRODUCT'],
    startsAt: startsAtUtc,
    endsAt: endsAtUtc,
    // Shopify's default (no combining) drops the flash discount whenever the cart also holds a product of the shared tier discount.
    combinesWith: { productDiscounts: true },
    metafields: [{ namespace: METAFIELD_NAMESPACE, key: METAFIELD_KEYS.flashRecord, type: 'json', value: JSON.stringify({ discountId }) }],
  }
}

/** Creates the Shopify discount and returns its id; throws Shopify's own message when it refuses. */
export async function createFlashRecord({ query, input }: { query: ShopifyQuery; input: FlashRecordInput }): Promise<string> {
  const data = await query<{
    discountAutomaticAppCreate: { automaticAppDiscount: { discountId: string } | null; userErrors: UserError[] }
  }>(
    `mutation createFlashRecord($automaticAppDiscount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
        automaticAppDiscount { discountId }
        userErrors { field message }
      }
    }`,
    { automaticAppDiscount: input },
  )
  const result = data.discountAutomaticAppCreate
  if (result.userErrors.length > 0) throw new Error(result.userErrors.map((error) => error.message).join('; '))
  if (!result.automaticAppDiscount) throw new Error('Shopify did not return the created discount')
  return result.automaticAppDiscount.discountId
}

export async function updateFlashRecord({ query, shopifyDiscountId, input }: {
  query: ShopifyQuery
  shopifyDiscountId: string
  input: FlashRecordInput
}): Promise<void> {
  const data = await query<{ discountAutomaticAppUpdate: { userErrors: UserError[] } }>(
    `mutation updateFlashRecord($id: ID!, $automaticAppDiscount: DiscountAutomaticAppInput!) {
      discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $automaticAppDiscount) {
        userErrors { field message }
      }
    }`,
    { id: shopifyDiscountId, automaticAppDiscount: input },
  )
  const errors = data.discountAutomaticAppUpdate.userErrors
  if (errors.length > 0) throw new Error(errors.map((error) => error.message).join('; '))
}

/**
 * A "not found" or "does not exist" answer counts as success: it means an
 * earlier delete already worked on Shopify's side, so a retry must not get stuck.
 */
export async function deleteFlashRecord({ query, shopifyDiscountId }: { query: ShopifyQuery; shopifyDiscountId: string }): Promise<void> {
  const data = await query<{ discountAutomaticDelete: { userErrors: UserError[] } }>(
    `mutation deleteFlashRecord($id: ID!) {
      discountAutomaticDelete(id: $id) {
        userErrors { field message }
      }
    }`,
    { id: shopifyDiscountId },
  )
  const realErrors = data.discountAutomaticDelete.userErrors.filter((error) => !/not found|does not exist/i.test(error.message))
  if (realErrors.length > 0) throw new Error(realErrors.map((error) => error.message).join('; '))
}
