import { shopifyQuery } from '@/lib/shopify-client'

export interface DiscountMember {
  productId: string
  /** Omitted for a whole-product member (single-variant products, or Collections-mode resolution — see spec §3, §5). */
  variantId?: string
}

export type TimeDiscountSelection =
  | { mode: 'products'; members: DiscountMember[] }
  | { mode: 'collections'; collectionIds: string[] }

export interface TimeDiscount {
  discountId: string
  /** GID of the real Shopify DiscountAutomaticApp record this discount owns — see spec §5. Shopify's own native startsAt/endsAt on that record govern activation; this app has no local status field. */
  shopifyDiscountId: string
  /** Internal admin-facing label. */
  name: string
  /** Customer-facing copy shown in the countdown widget. */
  title: string
  pricingMode: 'percent' | 'fixed'
  /** Single flat value — percent-off, or the fixed price. No tiers (see spec §2). */
  amount: number
  /** Naive (no offset) ISO datetime; entered/displayed in shop timezone by the admin UI. Converted to UTC only at the Admin API boundary, when writing this discount's native startsAt/endsAt (see spec §5). */
  startsAt: string
  endsAt: string
  /** Admin source of truth: how the merchant chose members — shown/edited on the discount page. */
  selection: TimeDiscountSelection
  /** Function-facing snapshot, recomputed at save time from `selection` (see spec §3, §5). The Function only ever reads this. */
  resolvedMembers: DiscountMember[]
}

export interface TimeDiscountsConfig {
  discounts: TimeDiscount[]
}

const NAMESPACE = 'sparkly_time_discounts'

async function getShopId(): Promise<string> {
  const data = await shopifyQuery<{ shop: { id: string } }>(`query { shop { id } }`)
  return data.shop.id
}

export async function getTimeDiscountsConfig(): Promise<TimeDiscountsConfig> {
  const data = await shopifyQuery<{
    shop: { metafield: { value: string } | null }
  }>(
    `query getTimeDiscountsConfig($namespace: String!, $key: String!) {
      shop {
        metafield(namespace: $namespace, key: $key) { value }
      }
    }`,
    { namespace: NAMESPACE, key: 'config' },
  )

  if (!data.shop.metafield) return { discounts: [] }

  const parsed = JSON.parse(data.shop.metafield.value) as Partial<TimeDiscountsConfig>
  return { discounts: Array.isArray(parsed.discounts) ? parsed.discounts : [] }
}

export async function saveTimeDiscountsConfig(config: TimeDiscountsConfig): Promise<void> {
  const shopId = await getShopId()

  const data = await shopifyQuery<{
    metafieldsSet: { userErrors: { field: string[]; message: string }[] }
  }>(
    `mutation setTimeDiscountsConfig($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        { ownerId: shopId, namespace: NAMESPACE, key: 'config', type: 'json', value: JSON.stringify(config) },
      ],
    },
  )

  if (data.metafieldsSet.userErrors.length > 0) {
    throw new Error(data.metafieldsSet.userErrors.map((e) => e.message).join('; '))
  }
}

/**
 * True when (productId, variantId) isn't already a resolvedMembers entry of
 * another time discount. Same matching rule as the existing app's
 * isProductAvailable: a whole-product claim blocks every variant and vice
 * versa. Pass the discount's own id as excludeDiscountId when validating an
 * in-progress edit.
 */
export function isTimeDiscountMemberAvailable(
  config: TimeDiscountsConfig,
  productId: string,
  variantId: string | undefined,
  excludeDiscountId?: string,
): boolean {
  return !config.discounts.some((discount) => {
    if (discount.discountId === excludeDiscountId) return false
    return discount.resolvedMembers.some((member) => {
      if (member.productId !== productId) return false
      if (member.variantId == null || variantId == null) return true
      return member.variantId === variantId
    })
  })
}

/**
 * True when every price in the list is equal, within floating-point
 * rounding. Deliberately redefined here rather than imported from
 * @/lib/config — see this plan's Global Constraints for why.
 */
export function pricesUniform(prices: number[]): boolean {
  if (prices.length <= 1) return true
  const [first, ...rest] = prices
  return rest.every((p) => Math.abs(p - first) <= 0.001)
}
