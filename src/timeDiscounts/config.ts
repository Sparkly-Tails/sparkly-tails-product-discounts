import { shopifyQuery } from '@/lib/shopify-client'
import { zonedTimeToUtc } from '@/lib/shop'

export interface DiscountMember {
  productId: string
  /** Omitted for a whole-product member (single-variant products, or Collections-mode resolution — see spec §3, §5). */
  variantId?: string
}

/** One product or variant with its OWN price rule. */
export interface TimeDiscountItem {
  productId: string
  /** Omitted = the whole (single-variant) product. */
  variantId?: string
  pricingMode: 'percent' | 'fixed'
  /** Percent off (0 < n <= 100), or the final price in major currency units. */
  amount: number
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
  /**
   * Per-row pricing. Not stored yet — a discount saved before per-row pricing
   * has none, and its resolvedMembers all share the discount's one
   * pricingMode/amount. Always read it through getDiscountItems().
   */
  items?: TimeDiscountItem[]
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

/**
 * A fixed price at or above the products' regular price discounts nothing
 * (checkout clamps it), so it is almost certainly a typo — returns the
 * message to show the merchant, or null when the price is fine or can't be
 * judged yet (not fixed mode, no amount, or no known regular price).
 * Shared by the create/edit forms and the server actions so the wording and
 * the rule stay identical.
 */
export function fixedPriceNotLowerError(
  pricingMode: 'percent' | 'fixed',
  amount: number,
  regularPrice: number | null | undefined,
): string | null {
  if (pricingMode !== 'fixed' || !(amount > 0) || !regularPrice || regularPrice <= 0) return null
  if (amount < regularPrice) return null
  return `The fixed price (£${amount.toFixed(2)}) is not lower than the regular price (£${regularPrice.toFixed(2)}), so it would not discount anything. Check the price you entered.`
}

/**
 * The discount's price rows: its stored `items`, or — for a discount saved
 * before per-row pricing — one row per resolved member carrying the
 * discount's single shared pricingMode/amount.
 */
export function getDiscountItems(
  discount: Pick<TimeDiscount, 'pricingMode' | 'amount' | 'resolvedMembers' | 'items'>,
): TimeDiscountItem[] {
  if (discount.items) return discount.items
  return discount.resolvedMembers.map((member) => ({
    productId: member.productId,
    ...(member.variantId ? { variantId: member.variantId } : {}),
    pricingMode: discount.pricingMode,
    amount: discount.amount,
  }))
}

/**
 * 'Upcoming' before startsAt, 'Active' from startsAt up to (but not
 * including) endsAt, 'Expired' from endsAt onward. `startsAt`/`endsAt` are
 * naive shop-local strings (see TimeDiscount) — `timezone` converts them to
 * real UTC instants before comparing against the current moment. Shared by
 * the discount list and the discount detail page so the two never drift
 * apart on what counts as the boundary instant.
 */
export function computeTimeDiscountStatusLabel(
  startsAt: string,
  endsAt: string,
  timezone: string,
): 'Upcoming' | 'Active' | 'Expired' {
  const startsAtMs = new Date(zonedTimeToUtc(startsAt, timezone)).getTime()
  const endsAtMs = new Date(zonedTimeToUtc(endsAt, timezone)).getTime()
  const nowMs = Date.now()
  return nowMs < startsAtMs ? 'Upcoming' : nowMs < endsAtMs ? 'Active' : 'Expired'
}
