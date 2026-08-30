import { shopifyQuery } from '@/lib/shopify-client'
import type { Discount } from '@/lib/config'
import { getMemberInfo } from '@/lib/products'

const NAMESPACE = 'sparkly_product_discounts'

interface DiscountMetafieldSibling {
  productId: string
  title: string
  handle: string
  variantId?: string
  imageUrl: string | null
}

interface DiscountMetafieldValue {
  discountId: string
  title: string
  pricingMode: 'percent' | 'fixed'
  tiers: Discount['tiers']
  /** null = single-variant whole-product member; array = these specific variants of THIS product are members. */
  ownVariantIds: string[] | null
  siblings: DiscountMetafieldSibling[]
}

/**
 * Writes one `discount` metafield per unique product touched by this
 * discount's members. A product with more than one of its own variants in
 * the discount gets ownVariantIds listing exactly which; a single-variant
 * whole-product member gets ownVariantIds: null. siblings has one entry per
 * OTHER member (not per other product) so a sibling product with two
 * variants in the discount produces two distinct rows.
 */
export async function syncDiscountMetafields(discount: Discount): Promise<void> {
  const memberInfo = await getMemberInfo(discount.members)
  const infoByKey = new Map(memberInfo.map((m) => [`${m.productId}::${m.variantId ?? ''}`, m]))
  const uniqueProductIds = [...new Set(discount.members.map((m) => m.productId))]

  const results = await Promise.allSettled(
    uniqueProductIds.map((productId) => {
      const ownMembers = discount.members.filter((m) => m.productId === productId)
      const ownVariantIds = ownMembers.some((m) => m.variantId == null)
        ? null
        : ownMembers.map((m) => m.variantId!)

      const siblings: DiscountMetafieldSibling[] = discount.members
        .filter((m) => m.productId !== productId)
        .map((m) => {
          const info = infoByKey.get(`${m.productId}::${m.variantId ?? ''}`)
          return {
            productId: m.productId,
            title: info?.title ?? '',
            handle: info?.handle ?? '',
            variantId: m.variantId,
            imageUrl: info?.imageUrl ?? null,
          }
        })

      const value: DiscountMetafieldValue = {
        discountId: discount.discountId,
        title: discount.title,
        pricingMode: discount.pricingMode,
        tiers: discount.tiers,
        ownVariantIds,
        siblings,
      }

      return setDiscountMetafield(productId, value)
    }),
  )

  const rejected = results.filter((r) => r.status === 'rejected')
  if (rejected.length > 0) {
    throw new Error(rejected.map((r) => (r as PromiseRejectedResult).reason?.message ?? String((r as PromiseRejectedResult).reason)).join('; '))
  }
}

async function setDiscountMetafield(productId: string, value: DiscountMetafieldValue): Promise<void> {
  const data = await shopifyQuery<{
    metafieldsSet: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation setDiscountMetafield($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        {
          ownerId: productId,
          namespace: NAMESPACE,
          key: 'discount',
          type: 'json',
          value: JSON.stringify(value),
        },
      ],
    },
  )

  if (data.metafieldsSet.userErrors.length > 0) {
    throw new Error(data.metafieldsSet.userErrors.map((e) => e.message).join('; '))
  }
}

/** Deletes the `discount` metafield from every unique product in the list. */
export async function clearDiscountMetafields(members: { productId: string }[]): Promise<void> {
  const uniqueProductIds = [...new Set(members.map((m) => m.productId))]

  const results = await Promise.allSettled(
    uniqueProductIds.map(async (productId) => {
      const data = await shopifyQuery<{
        metafieldsDelete: { userErrors: { field: string[]; message: string }[] }
      }>(
        `mutation deleteDiscountMetafield($metafields: [MetafieldIdentifierInput!]!) {
          metafieldsDelete(metafields: $metafields) {
            userErrors { field message }
          }
        }`,
        {
          metafields: [{ ownerId: productId, namespace: NAMESPACE, key: 'discount' }],
        },
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
