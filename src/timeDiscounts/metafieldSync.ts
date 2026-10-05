import { shopifyQuery } from '@/lib/shopify-client'
import { zonedTimeToUtc } from '@/lib/shop'
import type { TimeDiscount } from '@/timeDiscounts/config'

const NAMESPACE = 'sparkly_product_discounts'

interface TimeDiscountMetafieldValue {
  discountId: string
  title: string
  startsAt: string
  endsAt: string
  discountedPrice: number
}

/**
 * Writes the `discount` metafield to every unique product in resolvedMembers
 * — the storefront widget block reads this, keyed per product.
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
  const uniqueProductIds = [...new Set(discount.resolvedMembers.map((m) => m.productId))]

  const results = await Promise.allSettled(
    uniqueProductIds.map((productId) => setTimeDiscountMetafieldWithPrice(productId, discount, timeZone))
  )

  const rejected = results.filter((r) => r.status === 'rejected')
  if (rejected.length > 0) {
    throw new Error(rejected.map((r) => (r as PromiseRejectedResult).reason?.message ?? String((r as PromiseRejectedResult).reason)).join('; '))
  }
}

async function setTimeDiscountMetafieldWithPrice(productId: string, discount: TimeDiscount, timeZone: string): Promise<void> {
  const productData = await shopifyQuery<{
    product: { id: string; priceRange: { minVariantPrice: { amount: string } } } | null
  }>(
    `query getProductPrice($id: ID!) {
      product(id: $id) {
        id
        priceRange { minVariantPrice { amount } }
      }
    }`,
    { id: productId }
  )

  if (!productData.product) {
    throw new Error(`Product ${productId} not found`)
  }

  const originalPrice = parseFloat(productData.product.priceRange.minVariantPrice.amount)
  const discountedPrice = discount.pricingMode === 'percent'
    ? originalPrice * (1 - discount.amount / 100)
    : discount.amount

  const value: TimeDiscountMetafieldValue = {
    discountId: discount.discountId,
    title: discount.title,
    startsAt: zonedTimeToUtc(discount.startsAt, timeZone),
    endsAt: zonedTimeToUtc(discount.endsAt, timeZone),
    discountedPrice,
  }

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
