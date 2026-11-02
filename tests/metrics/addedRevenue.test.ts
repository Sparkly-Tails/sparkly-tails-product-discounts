import { describe, it, expect } from 'vitest'
import { measureAddedRevenue } from '@/metrics/addedRevenue'

describe('measureAddedRevenue', () => {
  it('is what was paid for the line minus one unit at the regular price', () => {
    expect(measureAddedRevenue({ unitPrice: 1.69, quantity: 10, discountAmount: 0.6 })).toBe(14.61)
  })

  it('is 0 for a single unit: the first unit is what the shopper would have bought anyway', () => {
    expect(measureAddedRevenue({ unitPrice: 1.69, quantity: 1, discountAmount: 0 })).toBe(0)
  })

  it('is never below 0, even when the discount is larger than the line', () => {
    expect(measureAddedRevenue({ unitPrice: 2, quantity: 3, discountAmount: 9 })).toBe(0)
  })

  it('rounds to cents', () => {
    expect(measureAddedRevenue({ unitPrice: 0.333, quantity: 4, discountAmount: 0 })).toBe(1)
  })
})
