const test = require('node:test')
const assert = require('node:assert/strict')
const { computeTierState, perUnitPrice } = require('../product-tier-pricing/assets/tier-pricing.js')

test('below every tier: no discount, lists every tier as a delta from current quantity', () => {
  const tiers = [{ minQty: 7, percentOff: 5 }, { minQty: 14, percentOff: 10 }]
  const result = computeTierState(tiers, 3)

  assert.equal(result.percentOff, 0)
  assert.equal(result.nextTier, null)
  assert.deepEqual(result.remainingTiers, [
    { minQty: 7, percentOff: 5, delta: 4 },
    { minQty: 14, percentOff: 10, delta: 11 },
  ])
})

test('between tiers: applies the lower tier, nudges toward the single next tier only', () => {
  const tiers = [{ minQty: 7, percentOff: 5 }, { minQty: 14, percentOff: 10 }]
  const result = computeTierState(tiers, 9)

  assert.equal(result.percentOff, 5)
  assert.deepEqual(result.nextTier, { minQty: 14, percentOff: 10, delta: 5 })
  assert.equal(result.remainingTiers, null)
})

test('at the highest tier: applies it, no nudge left', () => {
  const tiers = [{ minQty: 7, percentOff: 5 }, { minQty: 14, percentOff: 10 }]
  const result = computeTierState(tiers, 20)

  assert.equal(result.percentOff, 10)
  assert.equal(result.nextTier, null)
  assert.equal(result.remainingTiers, null)
})

test('exactly at a threshold counts as reached', () => {
  const tiers = [{ minQty: 7, percentOff: 5 }, { minQty: 14, percentOff: 10 }]
  const result = computeTierState(tiers, 14)

  assert.equal(result.percentOff, 10)
  assert.equal(result.nextTier, null)
})

test('single-tier product: below the tier', () => {
  const result = computeTierState([{ minQty: 7, percentOff: 5 }], 2)

  assert.equal(result.percentOff, 0)
  assert.equal(result.nextTier, null)
  assert.deepEqual(result.remainingTiers, [{ minQty: 7, percentOff: 5, delta: 5 }])
})

test('single-tier product: at the tier, never produces a next-tier state', () => {
  const result = computeTierState([{ minQty: 7, percentOff: 5 }], 7)

  assert.equal(result.percentOff, 5)
  assert.equal(result.nextTier, null)
  assert.equal(result.remainingTiers, null)
})

test('empty tiers array is a safe no-op', () => {
  const result = computeTierState([], 5)

  assert.equal(result.percentOff, 0)
  assert.equal(result.nextTier, null)
  assert.deepEqual(result.remainingTiers, [])
})

test('handles tiers passed out of order', () => {
  const tiers = [{ minQty: 14, percentOff: 10 }, { minQty: 7, percentOff: 5 }]
  const result = computeTierState(tiers, 9)

  assert.equal(result.percentOff, 5)
  assert.deepEqual(result.nextTier, { minQty: 14, percentOff: 10, delta: 5 })
})

test('a tier with no anchorPrice reports anchorPrice: null', () => {
  const result = computeTierState([{ minQty: 7, percentOff: 5 }], 7)
  assert.equal(result.anchorPrice, null)
  assert.equal(result.minQty, 7)
})

test('a reached tier surfaces its anchorPrice', () => {
  const result = computeTierState([{ minQty: 7, percentOff: 5, anchorPrice: 10.0 }], 7)
  assert.equal(result.anchorPrice, 10.0)
  assert.equal(result.minQty, 7)
})

test('perUnitPrice: falls back to plain percentage math when no anchor is set', () => {
  const state = { percentOff: 10, anchorPrice: null, minQty: 5 }
  assert.equal(perUnitPrice(2.0, 5, state), 1.8)
})

test('perUnitPrice: anchors the blended per-unit price exactly at minQty', () => {
  // full price 5*2.00=10.00, anchored to 8.50 -> per-unit is exactly 8.50/5
  const state = { percentOff: 10, anchorPrice: 8.5, minQty: 5 }
  assert.equal(perUnitPrice(2.0, 5, state), 1.7)
})

test('perUnitPrice: accrues extra units at the percent rate above minQty', () => {
  // Mirrors the Function's own test: anchor 8.50 + 2 extra units * (2.00*0.90) = 12.10 total, /7 qty
  const state = { percentOff: 10, anchorPrice: 8.5, minQty: 5 }
  const result = perUnitPrice(2.0, 7, state)
  assert.ok(Math.abs(result - 12.1 / 7) < 1e-9, `got ${result}`)
})
