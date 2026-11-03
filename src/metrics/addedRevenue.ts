/** Money as a number rounded to cents. */
export function roundMoney({ amount }: { amount: number }): number {
  return Math.round(amount * 100) / 100
}

/** What a bundle line brought in beyond one unit at the regular price: the first unit is what the shopper would have bought anyway. Never below 0. */
export function measureAddedRevenue({ unitPrice, quantity, discountAmount }: { unitPrice: number; quantity: number; discountAmount: number }): number {
  return Math.round(Math.max(0, unitPrice * quantity - discountAmount - unitPrice) * 100) / 100
}
