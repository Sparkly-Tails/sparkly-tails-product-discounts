import { syncTimeDiscountMetafields } from '@/timeDiscounts/metafieldSync'
import { shopifyQuery } from '@/lib/shopify-client'
import { assertItemsFitFunctionConfig } from '@/timeDiscounts/items'
import type { TimeDiscount, TimeDiscountItem, TimeDiscountsConfig } from '@/timeDiscounts/config'

const METAFIELD_NAMESPACE = 'sparkly_time_discounts'
/** Must match the `handle` in extensions/time-based-discount/shopify.extension.toml. */
const FUNCTION_HANDLE = 'time-based-discount'

interface FunctionConfigMetafield {
  namespace: string
  key: string
  type: string
  value: string
}

/** The Function's own per-discount config, written atomically as part of the DiscountAutomaticAppInput on create/update. */
export function buildFunctionConfigMetafield(items: TimeDiscountItem[]): FunctionConfigMetafield {
  assertItemsFitFunctionConfig(items)
  return { namespace: METAFIELD_NAMESPACE, key: 'function_config', type: 'json', value: JSON.stringify({ items }) }
}

export async function createShopifyDiscountRecord(input: {
  title: string
  startsAtUtc: string
  endsAtUtc: string
  items: TimeDiscountItem[]
}): Promise<string> {
  const data = await shopifyQuery<{
    discountAutomaticAppCreate: {
      automaticAppDiscount: { discountId: string } | null
      userErrors: { field: string[]; message: string }[]
    }
  }>(
    `mutation createTimeDiscountRecord($automaticAppDiscount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
        automaticAppDiscount { discountId }
        userErrors { field message }
      }
    }`,
    {
      automaticAppDiscount: {
        title: input.title,
        functionHandle: FUNCTION_HANDLE,
        discountClasses: ['PRODUCT'],
        startsAt: input.startsAtUtc,
        endsAt: input.endsAtUtc,
        metafields: [buildFunctionConfigMetafield(input.items)],
      },
    },
  )

  if (data.discountAutomaticAppCreate.userErrors.length > 0) {
    throw new Error(data.discountAutomaticAppCreate.userErrors.map((e) => e.message).join('; '))
  }
  if (!data.discountAutomaticAppCreate.automaticAppDiscount) {
    throw new Error('Shopify did not return the created discount')
  }
  return data.discountAutomaticAppCreate.automaticAppDiscount.discountId
}

interface ShopifyDiscountRecordUpdate {
  title?: string
  startsAtUtc?: string
  endsAtUtc?: string
  items?: TimeDiscountItem[]
}

/** Partial update — only the fields present in `update` are sent, matching Shopify's own documented partial-update behavior for this mutation. */
export async function updateShopifyDiscountRecord(shopifyDiscountId: string, update: ShopifyDiscountRecordUpdate): Promise<void> {
  const automaticAppDiscount: Record<string, unknown> = {}
  if (update.title !== undefined) automaticAppDiscount.title = update.title
  if (update.startsAtUtc !== undefined) automaticAppDiscount.startsAt = update.startsAtUtc
  if (update.endsAtUtc !== undefined) automaticAppDiscount.endsAt = update.endsAtUtc
  if (update.items !== undefined) automaticAppDiscount.metafields = [buildFunctionConfigMetafield(update.items)]

  const data = await shopifyQuery<{
    discountAutomaticAppUpdate: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation updateTimeDiscountRecord($id: ID!, $automaticAppDiscount: DiscountAutomaticAppInput!) {
      discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $automaticAppDiscount) {
        userErrors { field message }
      }
    }`,
    { id: shopifyDiscountId, automaticAppDiscount },
  )

  if (data.discountAutomaticAppUpdate.userErrors.length > 0) {
    throw new Error(data.discountAutomaticAppUpdate.userErrors.map((e) => e.message).join('; '))
  }
}

/**
 * Uses the generic discountAutomaticDelete mutation — there is no
 * discount-type-specific delete mutation. A "not found"/"does not
 * exist"-shaped userError is treated as a successful no-op rather than an
 * error: it means Shopify's side of a previous delete already succeeded
 * (e.g. this delete is a retry after saveTimeDiscountsConfig failed on a
 * prior attempt), so retrying must not get permanently stuck.
 */
export async function deleteShopifyDiscountRecord(shopifyDiscountId: string): Promise<void> {
  const data = await shopifyQuery<{
    discountAutomaticDelete: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation deleteTimeDiscountRecord($id: ID!) {
      discountAutomaticDelete(id: $id) {
        userErrors { field message }
      }
    }`,
    { id: shopifyDiscountId },
  )

  const realErrors = data.discountAutomaticDelete.userErrors.filter(
    (e) => !/not found|does not exist/i.test(e.message),
  )
  if (realErrors.length > 0) {
    throw new Error(realErrors.map((e) => e.message).join('; '))
  }
}

export function parseSchedule(startsAtRaw: string, endsAtRaw: string): { startsAt: string; endsAt: string } {
  const startsAt = startsAtRaw.trim()
  const endsAt = endsAtRaw.trim()
  if (!startsAt || !endsAt) throw new Error('Start and end date/time are required')
  // A half-typed year (e.g. 0202) still forms a valid pair; never let one reach Shopify.
  for (const value of [startsAt, endsAt]) {
    const year = Number(value.slice(0, 4))
    if (!(year >= 2000 && year <= 2100)) throw new Error('Enter dates between the years 2000 and 2100')
  }
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) throw new Error('End must be after start')
  return { startsAt, endsAt }
}

export function findDiscountOrThrow(config: TimeDiscountsConfig, discountId: string): TimeDiscount {
  const discount = config.discounts.find((d) => d.discountId === discountId)
  if (!discount) throw new Error(`Time discount ${discountId} not found`)
  return discount
}

/** The storefront sync runs after the discount is already saved and live, so a failure is logged, not surfaced as a failed save. */
export async function syncBestEffort(label: string, discount: TimeDiscount, timezone: string, onlyProductIds?: string[]): Promise<void> {
  try {
    await syncTimeDiscountMetafields(discount, timezone, onlyProductIds)
  } catch (err) {
    console.error(`[${label}] storefront metafield sync failed (discount is saved and live; the storefront may be stale for some products):`, err)
  }
}

/** The text to show for a thrown value. */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong — please try again'
}

/** Link base for a product's Shopify admin page; ends with `/admin/products/`. */
export function adminProductBaseUrl(): string {
  return `https://${process.env.SHOPIFY_SHOP}/admin/products/`
}
