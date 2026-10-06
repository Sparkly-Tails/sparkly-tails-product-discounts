import { shopifyQuery } from '@/lib/shopify-client'
import { zonedTimeToUtc } from '@/lib/shop'
import { getDiscountItems, type TimeDiscount } from '@/timeDiscounts/config'

const NAMESPACE = 'sparkly_product_discounts'

interface TimeDiscountMetafieldItem {
  /** Variant GID, or null for the whole (single-variant) product. */
  variantId: string | null
  pricingMode: 'percent' | 'fixed'
  /** Percent-off, or the fixed price in the shop's major currency unit (e.g. 22.5 = £22.50). */
  amount: number
}

interface TimeDiscountMetafieldValue {
  discountId: string
  title: string
  startsAt: string
  endsAt: string
  /** Only THIS product's rows; the widget picks the selected variant's row. */
  items: TimeDiscountMetafieldItem[]
}

/**
 * Writes the `time_based_discount` metafield to every unique product in the
 * discount's rows — the storefront scripts read this, keyed per product.
 *
 * The metafield carries each row's rule (pricingMode, amount, variant), not a
 * computed price: the scripts derive the displayed price from the live variant
 * price, so it can't go stale when a merchant edits a product price, and it
 * stays correct per variant.
 *
 * `discount.startsAt`/`endsAt` are always naive shop-local strings (no
 * timezone offset). The storefront widget parses the metafield value with
 * `new Date(...)` in the CUSTOMER's browser, which would interpret a naive
 * string as midnight in the customer's own local timezone — wrong for any
 * customer outside the shop's timezone. Converting to a real UTC ISO
 * instant here (the same conversion used at the Shopify Admin API boundary)
 * makes `new Date(...)` parse correctly in any browser, in any timezone.
 */
export async function syncTimeDiscountMetafields(discount: TimeDiscount, timeZone: string): Promise<void> {
  const startsAt = zonedTimeToUtc(discount.startsAt, timeZone)
  const endsAt = zonedTimeToUtc(discount.endsAt, timeZone)

  const itemsByProduct = new Map<string, TimeDiscountMetafieldItem[]>()
  for (const item of getDiscountItems(discount)) {
    const row: TimeDiscountMetafieldItem = { variantId: item.variantId ?? null, pricingMode: item.pricingMode, amount: item.amount }
    itemsByProduct.set(item.productId, [...(itemsByProduct.get(item.productId) ?? []), row])
  }

  const results = await Promise.allSettled(
    [...itemsByProduct].map(([productId, items]) =>
      setTimeDiscountMetafield(productId, { discountId: discount.discountId, title: discount.title, startsAt, endsAt, items }),
    ),
  )

  const rejected = results.filter((r) => r.status === 'rejected')
  if (rejected.length > 0) {
    throw new Error(rejected.map((r) => (r as PromiseRejectedResult).reason?.message ?? String((r as PromiseRejectedResult).reason)).join('; '))
  }
}

async function setTimeDiscountMetafield(productId: string, value: TimeDiscountMetafieldValue): Promise<void> {
  const data = await shopifyQuery<{
    metafieldsSet: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation setTimeDiscountMetafield($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        { ownerId: productId, namespace: NAMESPACE, key: 'time_based_discount', type: 'json', value: JSON.stringify(value) },
      ],
    },
  )

  if (data.metafieldsSet.userErrors.length > 0) {
    throw new Error(data.metafieldsSet.userErrors.map((e) => e.message).join('; '))
  }
}

/** Deletes the `time_based_discount` metafield from every unique product in the list. */
export async function clearTimeDiscountMetafields(members: { productId: string }[]): Promise<void> {
  const uniqueProductIds = [...new Set(members.map((m) => m.productId))]

  const results = await Promise.allSettled(
    uniqueProductIds.map(async (productId) => {
      const data = await shopifyQuery<{
        metafieldsDelete: { userErrors: { field: string[]; message: string }[] }
      }>(
        `mutation deleteTimeDiscountMetafield($metafields: [MetafieldIdentifierInput!]!) {
          metafieldsDelete(metafields: $metafields) {
            userErrors { field message }
          }
        }`,
        { metafields: [{ ownerId: productId, namespace: NAMESPACE, key: 'time_based_discount' }] },
      )

      if (data.metafieldsDelete.userErrors.length > 0) {
        throw new Error(data.metafieldsDelete.userErrors.map((e) => e.message).join('; '))
      }
    }),
  )

  const rejected = results.filter((r) => r.status === 'rejected')
  if (rejected.length > 0) {
    throw new Error(rejected.map((r) => (r as PromiseRejectedResult).reason?.message ?? String((r as PromiseRejectedResult).reason)).join('; '))
  }
}
