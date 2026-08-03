import { describe, it, expect } from 'vitest'
import { resultingPrice, totalAtThreshold, clampedFixedPrice, totalAtThresholdFixed } from '@/lib/tier-math'

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

describe('totalAtThreshold', () => {
  it('uses the anchor price when set, ignoring the percentage math entirely', () => {
    // 1.49 at 5% off * 7 would be 9.91 (or 10.01 depending on rounding order) — anchor overrides it to a clean £10
    expect(totalAtThreshold(1.49, { minQty: 7, percentOff: 5, anchorPrice: 10.0 })).toBe(10.0)
  })

  it('falls back to per-unit price times minQty when no anchor is set', () => {
    expect(totalAtThreshold(10.0, { minQty: 5, percentOff: 10 })).toBe(45.0)
  })

  it('rounds the fallback total to 2 decimal places', () => {
    expect(totalAtThreshold(1.49, { minQty: 7, percentOff: 5 })).toBeCloseTo(9.94, 2)
  })

  it('clamps an anchor price above sticker price down to the full undiscounted total', () => {
    // 5 * 2.00 = 10.00 full price — a merchant fat-fingering anchorPrice: 50
    // must not have this preview show 50; the Function refuses to produce a
    // negative discount, so the customer is actually charged the full 10.00.
    expect(totalAtThreshold(2.0, { minQty: 5, percentOff: 10, anchorPrice: 50 })).toBe(10.0)
  })

  it('clamps a negative anchor price up to 0', () => {
    expect(totalAtThreshold(2.0, { minQty: 5, percentOff: 10, anchorPrice: -5 })).toBe(0)
  })
})

describe('clampedFixedPrice', () => {
  it('returns the fixed price as-is when below the base price', () => {
    expect(clampedFixedPrice(1.99, 1.50)).toBe(1.50)
  })

  it('clamps a fixed price above the base price down to the base price', () => {
    // A merchant fat-fingering fixedPrice: 5.00 on a £1.49 product must not
    // preview a markup — the Function refuses to produce a negative
    // discount, so the customer is actually charged the normal £1.49.
    expect(clampedFixedPrice(1.49, 5.00)).toBe(1.49)
  })

  it('clamps a negative fixed price up to 0', () => {
    expect(clampedFixedPrice(1.49, -1)).toBe(0)
  })

  it('rounds to 2 decimal places', () => {
    // 1.005 itself sits on a binary floating-point representation boundary
    // (it's actually stored as ~1.00499999999999989) and would round down —
    // the same class of trap the resultingPrice tests avoid by using
    // 1.4501 instead of a bare .xx5 value. 1.0051 tests the same rounding
    // behavior unambiguously.
    expect(clampedFixedPrice(10.0, 1.0051)).toBeCloseTo(1.01, 2)
  })
})

describe('totalAtThresholdFixed', () => {
  it('multiplies the clamped per-unit price by minQty', () => {
    expect(totalAtThresholdFixed(1.99, { minQty: 3, fixedPrice: 1.50 })).toBe(4.50)
  })

  it('uses the clamped price, not the raw one, when fixedPrice exceeds the base price', () => {
    expect(totalAtThresholdFixed(1.49, { minQty: 3, fixedPrice: 5.00 })).toBeCloseTo(4.47, 2)
  })
})
