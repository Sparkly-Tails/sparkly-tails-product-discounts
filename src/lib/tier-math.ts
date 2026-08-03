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
 *
 * A misconfigured anchorPrice (negative, or higher than the plain undiscounted
 * total) is clamped to the undiscounted price, mirroring the safety clamp the
 * Discount Function applies at checkout — without this, a merchant could set
 * an anchor above sticker price and this preview would show that wrong,
 * too-high total instead of what the customer will actually be charged (full
 * price, since the Function refuses to produce a negative discount).
 */
export function totalAtThreshold(
  basePrice: number,
  tier: { minQty: number; percentOff: number; anchorPrice?: number },
): number {
  if (tier.anchorPrice != null) {
    const fullPrice = Math.round(basePrice * tier.minQty * 100) / 100
    const clamped = Math.min(Math.max(tier.anchorPrice, 0), fullPrice)
    return Math.round(clamped * 100) / 100
  }
  return Math.round(resultingPrice(basePrice, tier.percentOff) * tier.minQty * 100) / 100
}

/**
 * The price per unit for a fixed-price tier, clamped to the product's
 * actual base price. A fixedPrice above sticker price would otherwise
 * preview (and, without this clamp existing symmetrically in the Discount
 * Function, could imply) charging MORE than the product normally costs —
 * the Function refuses to produce a negative discount, so this preview
 * must always show that same clamped reality.
 */
export function clampedFixedPrice(basePrice: number, fixedPrice: number): number {
  const clamped = Math.min(Math.max(fixedPrice, 0), basePrice)
  return Math.round(clamped * 100) / 100
}

/**
 * The total price a customer pays for exactly minQty units of a
 * fixed-price tier — the clamped per-unit price times minQty, rounded to
 * 2 decimal places.
 */
export function totalAtThresholdFixed(basePrice: number, tier: { minQty: number; fixedPrice: number }): number {
  return Math.round(clampedFixedPrice(basePrice, tier.fixedPrice) * tier.minQty * 100) / 100
}
