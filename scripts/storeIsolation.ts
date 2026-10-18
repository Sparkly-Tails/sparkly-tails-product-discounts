/** What one store shows when the isolation check reads it. */
export interface StoreSnapshot {
  shop: string
  /** The value of the marker metafield as this store reads it, or null when it has none. */
  marker: string | null
  /** The ids of every automatic app discount the store lists. */
  discountIds: string[]
  /** How many of those belong to the tier checkout Function. */
  tierDiscountCount: number
}

/**
 * The problems found when store `a` (the one the marker was written for) and store `b` are read side by side.
 * Two independent stores must share no discount id, `b` must not see what was written for `a`, and each
 * store must have exactly one tier discount.
 */
export function compareStoreSnapshots(a: StoreSnapshot, b: StoreSnapshot): string[] {
  const violations: string[] = []

  if (a.marker === null) violations.push(`The marker written for ${a.shop} cannot be read back on ${a.shop}`)
  if (b.marker !== null) violations.push(`${b.shop} can read a config written for ${a.shop}`)

  const idsOfB = new Set(b.discountIds)
  for (const id of a.discountIds) {
    if (idsOfB.has(id)) violations.push(`Discount ${id} is listed by both ${a.shop} and ${b.shop}`)
  }

  for (const store of [a, b]) {
    if (store.tierDiscountCount !== 1) violations.push(`${store.shop} has ${store.tierDiscountCount} tier discounts, expected exactly 1`)
  }

  return violations
}
