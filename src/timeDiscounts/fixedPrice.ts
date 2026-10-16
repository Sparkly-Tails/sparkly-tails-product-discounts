// Pure and client-safe: client components reach this through items.ts, so it must not live in
// config.ts (which imports the server-only Shopify client).

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
