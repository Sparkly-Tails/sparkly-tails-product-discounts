// Pure and client-safe: a client component can import this without pulling in
// the server-only config module (which now reaches next/headers).

/** True when every price in the list is equal, within floating-point rounding. */
export function pricesUniform(prices: number[]): boolean {
  if (prices.length <= 1) return true
  const [first, ...rest] = prices
  return rest.every((p) => Math.abs(p - first) <= 0.001)
}
