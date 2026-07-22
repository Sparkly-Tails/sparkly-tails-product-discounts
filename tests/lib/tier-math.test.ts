import { describe, it, expect } from 'vitest'
import { resultingPrice } from '@/lib/tier-math'

describe('resultingPrice', () => {
  it('computes a simple percentage off', () => {
    expect(resultingPrice(10.0, 10)).toBe(9.0)
  })

  it('computes a fractional percentage off', () => {
    expect(resultingPrice(1.70, 14.7)).toBeCloseTo(1.45, 2)
  })

  it('rounds to 2 decimal places using standard rounding', () => {
    // 1.4501 rounds up, not down — the classic float-rounding trap
    expect(resultingPrice(1.4501, 0)).toBe(1.45)
  })

  it('returns the base price unchanged at 0% off', () => {
    expect(resultingPrice(20.0, 0)).toBe(20.0)
  })

  it('returns 0 at 100% off', () => {
    expect(resultingPrice(20.0, 100)).toBe(0)
  })
})
