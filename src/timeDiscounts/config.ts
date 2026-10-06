import { shopifyQuery } from '@/lib/shopify-client'
import { zonedTimeToUtc } from '@/lib/shop'

/** A product/variant as stored by discounts saved before per-row pricing. Only read when normalizing them. */
export interface DiscountMember {
  productId: string
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

export interface TimeDiscount {
  discountId: string
  /** GID of the real Shopify DiscountAutomaticApp record this discount owns. Shopify's own native startsAt/endsAt on that record govern activation; this app has no local status field. */
  shopifyDiscountId: string
  /** Legacy internal label — kept equal to `title` on every title save and never shown. */
  name: string
  /** Shown to customers in the countdown widget and used as the admin label. */
  title: string
  /** Naive (no offset) ISO datetime; entered/displayed in shop timezone by the admin UI. Converted to UTC only at the Admin API boundary, when writing this discount's native startsAt/endsAt. */
  startsAt: string
  endsAt: string
  /** The rows: each product/variant with its own price rule. */
  items: TimeDiscountItem[]
}

/**
 * What may be on disk: a discount saved before per-row pricing has one shared
 * `pricingMode`/`amount` plus `resolvedMembers` (and a `selection`, ignored)
 * instead of `items`.
 */
export interface StoredTimeDiscount {
  discountId: string
  shopifyDiscountId: string
  name: string
  title: string
  startsAt: string
  endsAt: string
  items?: TimeDiscountItem[]
  pricingMode?: 'percent' | 'fixed'
  amount?: number
  resolvedMembers?: DiscountMember[]
}

/**
 * Converts a stored discount to the current shape, in memory only (nothing is
 * rewritten until the discount is next saved): an older discount becomes one
 * row per product/variant it covered, each carrying its one shared rule. A
 * collection discount needs no lookup — resolvedMembers already is the
 * snapshot of the products it covered.
 */
export function normalizeTimeDiscount(stored: StoredTimeDiscount): TimeDiscount {
  const items: TimeDiscountItem[] =
    stored.items ??
    (stored.resolvedMembers ?? []).map((member) => ({
      productId: member.productId,
      ...(member.variantId ? { variantId: member.variantId } : {}),
      pricingMode: stored.pricingMode ?? 'percent',
      amount: stored.amount ?? 0,
    }))
  return {
    discountId: stored.discountId,
    shopifyDiscountId: stored.shopifyDiscountId,
    name: stored.name,
    title: stored.title,
    startsAt: stored.startsAt,
    endsAt: stored.endsAt,
    items,
  }
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

  const parsed = JSON.parse(data.shop.metafield.value) as { discounts?: StoredTimeDiscount[] }
  return { discounts: Array.isArray(parsed.discounts) ? parsed.discounts.map(normalizeTimeDiscount) : [] }
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
 * True when (productId, variantId) isn't already a row of another time
 * discount. Same matching rule as the existing app's
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
    return discount.items.some((member) => {
      if (member.productId !== productId) return false
      if (member.variantId == null || variantId == null) return true
      return member.variantId === variantId
    })
  })
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
