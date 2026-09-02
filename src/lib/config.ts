import { shopifyQuery } from '@/lib/shopify-client'

export interface Tier {
  minQty: number
  percentOff?: number
  /**
   * Optional exact total price to charge for minQty units (e.g. £10.00 for
   * 7 tins instead of the percentage's rounded £10.01). Units beyond minQty
   * still accrue at the normal percentOff per-unit rate — only the price at
   * exactly minQty is anchored. percent mode only, and only valid when
   * every member of the discount shares one base price — see
   * pricesUniform.
   */
  anchorPrice?: number
  /**
   * Absolute price per unit for a fixed-price tier (e.g. £1.50) — every
   * unit in the reached tier is charged this price directly, no percentage
   * involved. fixed mode only. Mutually exclusive with percentOff/
   * anchorPrice, enforced by the admin actions that construct a Tier, not
   * by this type. Only valid when every member shares one base price.
   */
  fixedPrice?: number
}

export interface DiscountMember {
  productId: string
  /**
   * Omitted only when the product has exactly one variant — that variant
   * is implied. A product with more than one variant must always specify
   * which variant this member is; there is no ambiguous "whole
   * multi-variant product" membership.
   */
  variantId?: string
}

export interface Discount {
  discountId: string
  /** Internal admin-facing label. */
  name: string
  /** Customer-facing copy used in storefront promo text. Blank allowed. */
  title: string
  status: 'draft' | 'live'
  pricingMode: 'percent' | 'fixed'
  members: DiscountMember[]
  tiers: Tier[]
}

export interface Config {
  discounts: Discount[]
}

const NAMESPACE = 'sparkly_product_discounts'

async function getShopId(): Promise<string> {
  const data = await shopifyQuery<{ shop: { id: string } }>(
    `query { shop { id } }`,
  )
  return data.shop.id
}

export async function getConfig(): Promise<Config> {
  const data = await shopifyQuery<{
    shop: { metafield: { value: string } | null }
  }>(
    `query getConfig($namespace: String!, $key: String!) {
      shop {
        metafield(namespace: $namespace, key: $key) { value }
      }
    }`,
    { namespace: NAMESPACE, key: 'config' },
  )

  if (!data.shop.metafield) {
    return { discounts: [] }
  }

  const parsed = JSON.parse(data.shop.metafield.value) as Partial<Config>
  return { discounts: Array.isArray(parsed.discounts) ? parsed.discounts : [] }
}

export async function saveConfig(config: Config): Promise<void> {
  const shopId = await getShopId()

  const data = await shopifyQuery<{
    metafieldsSet: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation setConfig($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        {
          ownerId: shopId,
          namespace: NAMESPACE,
          key: 'config',
          type: 'json',
          value: JSON.stringify(config),
        },
      ],
    },
  )

  if (data.metafieldsSet.userErrors.length > 0) {
    throw new Error(
      data.metafieldsSet.userErrors.map((e) => e.message).join('; '),
    )
  }
}

/**
 * True when (productId, variantId) isn't already claimed by another
 * discount's member. Two members match when their productId is equal AND
 * either shares the same variantId, or at least one of them has no
 * variantId at all (a whole-product claim blocks every variant of that
 * product, and vice versa). Pass the discount's own id as excludeDiscountId
 * when validating an in-progress edit so it doesn't flag its own members.
 */
export function isProductAvailable(
  config: Config,
  productId: string,
  variantId: string | undefined,
  excludeDiscountId?: string,
): boolean {
  return !config.discounts.some((discount) => {
    if (discount.discountId === excludeDiscountId) return false
    return discount.members.some((member) => {
      if (member.productId !== productId) return false
      if (member.variantId == null || variantId == null) return true
      return member.variantId === variantId
    })
  })
}

/** True when every price in the list is equal, within floating-point rounding. */
export function pricesUniform(prices: number[]): boolean {
  if (prices.length <= 1) return true
  const [first, ...rest] = prices
  return rest.every((p) => Math.abs(p - first) <= 0.001)
}
