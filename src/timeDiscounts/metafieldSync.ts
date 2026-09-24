import { shopifyQuery } from '@/lib/shopify-client'
import type { TimeDiscount } from '@/timeDiscounts/config'

const NAMESPACE = 'sparkly_time_discounts'

interface TimeDiscountMetafieldValue {
  discountId: string
  title: string
  pricingMode: 'percent' | 'fixed'
  amount: number
  startsAt: string
  endsAt: string
}

/** Writes the `discount` metafield to every unique product in resolvedMembers — the storefront widget block reads this, keyed per product. */
export async function syncTimeDiscountMetafields(discount: TimeDiscount): Promise<void> {
  const uniqueProductIds = [...new Set(discount.resolvedMembers.map((m) => m.productId))]
  const value: TimeDiscountMetafieldValue = {
    discountId: discount.discountId,
    title: discount.title,
    pricingMode: discount.pricingMode,
    amount: discount.amount,
    startsAt: discount.startsAt,
    endsAt: discount.endsAt,
  }

  const results = await Promise.allSettled(uniqueProductIds.map((productId) => setTimeDiscountMetafield(productId, value)))

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
        { ownerId: productId, namespace: NAMESPACE, key: 'discount', type: 'json', value: JSON.stringify(value) },
      ],
    },
  )

  if (data.metafieldsSet.userErrors.length > 0) {
    throw new Error(data.metafieldsSet.userErrors.map((e) => e.message).join('; '))
  }
}

/** Deletes the `discount` metafield from every unique product in the list. */
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
        { metafields: [{ ownerId: productId, namespace: NAMESPACE, key: 'discount' }] },
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
