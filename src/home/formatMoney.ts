// The text of an amount in the shop's currency ("£1.50"). An invalid currency
// code falls back to two plain decimals instead of throwing.
export function formatMoneyAmount({ amount, currencyCode }: { amount: number; currencyCode: string }): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: currencyCode }).format(amount)
  } catch {
    return amount.toFixed(2)
  }
}
