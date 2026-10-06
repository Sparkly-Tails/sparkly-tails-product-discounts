import { shopifyQuery } from '@/lib/shopify-client'
import { zonedTimeToUtc } from '@/lib/shop'

/** A product, or one variant of it, picked for a discount. Omitting `variantId` means the whole product. */
export interface DiscountMember {
  productId: string
  variantId?: string
}

/** A group's pick of a product or variant, with the title its chip shows. */
export type GroupMember = DiscountMember & { title: string }

/** A group's pick of a collection, with the title its chip shows (stored so a chip needs no lookup). */
export interface GroupCollection {
  id: string
  title: string
}

/** What a group is picked by: individual products/variants, or collections — never both. */
export type GroupSelection =
  | { mode: 'products'; members: GroupMember[] }
  | { mode: 'collections'; collections: GroupCollection[] }

/** What a group discount stores: its one shared rule and its picks. Its `items` are rebuilt from this on every save. */
export interface GroupSpec {
  pricingMode: 'percent' | 'fixed'
  /** Percent off (0 < n <= 100), or the final price in major currency units. */
  amount: number
  selection: GroupSelection
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
  /** 'perProduct': the merchant edits `items` directly. 'group': `items` are derived from `group`. Fixed when the discount is created. */
  kind: 'perProduct' | 'group'
  /** The rows the checkout Function and the storefront read: each product/variant with its own price rule. For a group, rebuilt from `group` on every save. */
  items: TimeDiscountItem[]
  /** Present only when `kind` is 'group'. */
  group?: GroupSpec
}

/** A discount as it may sit in the stored config: `kind` and `items` can be missing in older data. */
export type StoredTimeDiscount = Omit<TimeDiscount, 'kind' | 'items'> & { kind?: TimeDiscount['kind']; items?: TimeDiscount['items'] }

/** A discount stored before `kind` existed (or without it) is a per-product discount; one stored before per-row pricing has no rows. */
export function withDefaultKind(stored: StoredTimeDiscount): TimeDiscount {
  return { ...stored, kind: stored.kind ?? 'perProduct', items: stored.items ?? [] }
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
  return { discounts: Array.isArray(parsed.discounts) ? parsed.discounts.map(withDefaultKind) : [] }
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
