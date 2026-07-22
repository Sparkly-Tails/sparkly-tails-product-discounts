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
