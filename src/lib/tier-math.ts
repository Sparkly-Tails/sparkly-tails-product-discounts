/**
 * Given a base price and a percentage off (e.g. 14.7 for 14.7%), returns
 * the actual price a customer pays, rounded to 2 decimal places using
 * standard rounding — the same rounding Shopify applies at checkout.
 */
export function resultingPrice(basePrice: number, percentOff: number): number {
  const fraction = percentOff / 100
  const raw = basePrice * (1 - fraction)
  return Math.round(raw * 100) / 100
}

/**
 * The total price a customer pays for exactly minQty units of a tier. If the
 * tier has an anchorPrice set, that exact total is used (e.g. £10.00 instead
 * of a percentage's rounded £10.01) — otherwise it's the per-unit resulting
 * price times minQty, rounded to 2 decimal places.
 */
export function totalAtThreshold(
  basePrice: number,
  tier: { minQty: number; percentOff: number; anchorPrice?: number },
): number {
  if (tier.anchorPrice != null) return tier.anchorPrice
  return Math.round(resultingPrice(basePrice, tier.percentOff) * tier.minQty * 100) / 100
}
