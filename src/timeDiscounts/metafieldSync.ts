import { shopifyQuery } from '@/lib/shopify-client'
import { zonedTimeToUtc } from '@/lib/shop'
import type { TimeDiscount, DiscountMember } from '@/timeDiscounts/config'

const NAMESPACE = 'sparkly_product_discounts'

interface TimeDiscountMetafieldValue {
  discountId: string
  title: string
  startsAt: string
  endsAt: string
  pricingMode: 'percent' | 'fixed'
  /** Percent-off, or the fixed price in the shop's major currency unit (e.g. 22.5 = £22.50). */
  amount: number
  /** Variant GIDs this discount covers on the product; null means every variant. */
  variantIds: string[] | null
}

/**
 * Writes the `time_based_discount` metafield to every unique product in
 * resolvedMembers — the storefront widget block reads this, keyed per product.
 *
 * The metafield carries the discount's parameters (pricingMode, amount,
 * variantIds), not a computed price: the widget derives the discounted price
 * from the live variant price, so it can't go stale when a merchant edits a
 * product price, and it stays correct per variant.
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

  const membersByProduct = new Map<string, DiscountMember[]>()
  for (const member of discount.resolvedMembers) {
    membersByProduct.set(member.productId, [...(membersByProduct.get(member.productId) ?? []), member])
  }

  const results = await Promise.allSettled(
    [...membersByProduct].map(([productId, members]) =>
      setTimeDiscountMetafield(productId, {
        discountId: discount.discountId,
        title: discount.title,
        startsAt,
        endsAt,
        pricingMode: discount.pricingMode,
        amount: discount.amount,
        variantIds: coveredVariantIds(members),
      }),
    ),
  )

  const rejected = results.filter((r) => r.status === 'rejected')
  if (rejected.length > 0) {
    throw new Error(rejected.map((r) => (r as PromiseRejectedResult).reason?.message ?? String((r as PromiseRejectedResult).reason)).join('; '))
  }
}

/** A whole-product member covers every variant; otherwise only the listed variants are covered. */
function coveredVariantIds(members: DiscountMember[]): string[] | null {
  if (members.some((m) => !m.variantId)) return null
  return [...new Set(members.map((m) => m.variantId as string))]
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
