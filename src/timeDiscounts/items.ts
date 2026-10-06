import { fixedPriceNotLowerError, type TimeDiscountItem } from '@/timeDiscounts/config'

/**
 * Shopify never hands a Function a metafield value over 10,000 bytes — it
 * comes back as `null`, and the Function then silently applies NO discount at
 * checkout while the admin and storefront still show it as active. Guard well
 * below the real limit.
 */
export const FUNCTION_CONFIG_MAX_BYTES = 9500

type Rule = { pricingMode: 'percent' | 'fixed'; amount: number }
type Key = { productId: string; variantId?: string }

/** Stable identity of a row within a discount. */
export function itemKey(item: Key): string {
  return `${item.productId}|${item.variantId ?? ''}`
}

/** Link to a product's Shopify admin page; `baseUrl` ends with `/admin/products/`. */
export function productAdminUrl(baseUrl: string, productId: string): string {
  return `${baseUrl}${productId.split('/').pop()}`
}

/**
 * What a customer pays for one unit, in major currency units, rounded to
 * pence. A fixed price at or above the regular price discounts nothing (the
 * checkout Function clamps it), so it never shows as higher than the regular
 * price.
 */
export function discountedPrice(rule: Rule, regularPrice: number): number {
  const price =
    rule.pricingMode === 'fixed'
      ? Math.min(rule.amount, regularPrice)
      : regularPrice * (1 - Math.min(Math.max(rule.amount, 0), 100) / 100)
  return Math.round(price * 100) / 100
}

/** The message to show for an invalid rule, or null when it is fine. `regularPrice` null = unknown. */
export function validateRule(rule: Rule, regularPrice: number | null): string | null {
  if (!(rule.amount > 0)) return 'Enter an amount greater than zero'
  if (rule.pricingMode === 'percent' && rule.amount > 100) return 'A percentage discount cannot exceed 100%'
  return fixedPriceNotLowerError(rule.pricingMode, rule.amount, regularPrice)
}

/**
 * Rules about the rows together: a product/variant appears once, and a
 * whole-product row cannot coexist with variant rows of the same product
 * (which one would apply to the variant?).
 */
export function validateItemsStructure(items: TimeDiscountItem[]): string | null {
  const seen = new Set<string>()
  for (const item of items) {
    const key = itemKey(item)
    if (seen.has(key)) return 'This product or variant is already in the discount'
    seen.add(key)
  }
  for (const item of items) {
    if (item.variantId == null) continue
    if (seen.has(itemKey({ productId: item.productId }))) {
      return 'A product cannot have both a whole-product row and variant rows'
    }
  }
  return null
}

/** Size, in bytes, of the Function config these rows serialize to. */
export function functionConfigBytes(items: TimeDiscountItem[]): number {
  return new TextEncoder().encode(JSON.stringify({ items })).length
}

export function assertItemsFitFunctionConfig(items: TimeDiscountItem[]): void {
  if (functionConfigBytes(items) > FUNCTION_CONFIG_MAX_BYTES) {
    throw new Error(
      `This discount has too many products/variants to fit in a single time-based discount (${items.length} rows; about 60 is the most). Split it into two discounts.`,
    )
  }
}
