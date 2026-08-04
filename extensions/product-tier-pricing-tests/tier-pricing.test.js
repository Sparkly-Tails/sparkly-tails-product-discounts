const test = require('node:test')
const assert = require('node:assert/strict')
const { computeTierState, perUnitPrice, sumGroupQuantityInCart, unitPriceAtTier, totalAtTier, computeProgressState, formatCalloutText, formatTempBoxLabel, buildPromoText, computeOrderSummary, computeTierButtonsSignature, withUnitAnchor } = require('../product-tier-pricing/assets/tier-pricing.js')

test('below every tier: no discount, lists every tier as a delta from current quantity', () => {
  const tiers = [{ minQty: 7, percentOff: 5 }, { minQty: 14, percentOff: 10 }]
  const result = computeTierState(tiers, 3)

  assert.equal(result.percentOff, 0)
  assert.equal(result.nextTier, null)
  assert.deepEqual(result.remainingTiers, [
    { minQty: 7, percentOff: 5, fixedPrice: null, delta: 4 },
    { minQty: 14, percentOff: 10, fixedPrice: null, delta: 11 },
  ])
})

test('between tiers: applies the lower tier, nudges toward the single next tier only', () => {
  const tiers = [{ minQty: 7, percentOff: 5 }, { minQty: 14, percentOff: 10 }]
  const result = computeTierState(tiers, 9)

  assert.equal(result.percentOff, 5)
  assert.deepEqual(result.nextTier, { minQty: 14, percentOff: 10, fixedPrice: null, delta: 5 })
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
  assert.deepEqual(result.remainingTiers, [{ minQty: 7, percentOff: 5, fixedPrice: null, delta: 5 }])
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
  assert.deepEqual(result.nextTier, { minQty: 14, percentOff: 10, fixedPrice: null, delta: 5 })
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

test('perUnitPrice: clamps an anchor above sticker price down to full price, never a markup', () => {
  // full price 5*2.00=10.00 — anchorPrice of 50 must not render as "was
  // £2.00, now £10.00 (a markup)". The Function refuses to produce a
  // negative discount, so the true charge is full price; mirror that here.
  const state = { percentOff: 10, anchorPrice: 50, minQty: 5 }
  assert.equal(perUnitPrice(2.0, 5, state), 2.0)
})

test('computeTierState: a reached fixed-price tier reports fixedPrice, percentOff stays 0', () => {
  const tiers = [{ minQty: 1, fixedPrice: 1.70 }, { minQty: 3, fixedPrice: 1.50 }]
  const result = computeTierState(tiers, 3)

  assert.equal(result.percentOff, 0)
  assert.equal(result.fixedPrice, 1.50)
  assert.equal(result.minQty, 3)
})

test('computeTierState: below the lowest fixed-price tier reports no discount and lists fixedPrice on remaining tiers', () => {
  const tiers = [{ minQty: 3, fixedPrice: 1.50 }]
  const result = computeTierState(tiers, 1)

  assert.equal(result.fixedPrice, null)
  assert.deepEqual(result.remainingTiers, [{ minQty: 3, percentOff: undefined, fixedPrice: 1.50, delta: 2 }])
})

test('computeTierState: between fixed-price tiers, nextTier carries the next fixedPrice', () => {
  const tiers = [{ minQty: 1, fixedPrice: 1.70 }, { minQty: 3, fixedPrice: 1.50 }]
  const result = computeTierState(tiers, 2)

  assert.equal(result.fixedPrice, 1.70)
  assert.deepEqual(result.nextTier, { minQty: 3, percentOff: undefined, fixedPrice: 1.50, delta: 1 })
})

test('perUnitPrice: a fixed-price state returns the fixed price directly, ignoring quantity', () => {
  const state = { percentOff: 0, anchorPrice: null, fixedPrice: 1.50, minQty: 3 }
  assert.equal(perUnitPrice(1.99, 5, state), 1.50)
})

test('perUnitPrice: a fixed price above base price clamps to base price, never a markup', () => {
  const state = { percentOff: 0, anchorPrice: null, fixedPrice: 5.0, minQty: 3 }
  assert.equal(perUnitPrice(1.49, 5, state), 1.49)
})

test('sumGroupQuantityInCart: sums quantities of cart items matching the given handles', () => {
  const items = [
    { handle: 'tuna-soup', quantity: 3 },
    { handle: 'chicken-soup', quantity: 2 },
    { handle: 'unrelated-product', quantity: 5 },
  ]
  const result = sumGroupQuantityInCart(items, ['tuna-soup', 'chicken-soup', 'ocean-soup'])
  assert.equal(result, 5)
})

test('sumGroupQuantityInCart: returns 0 for an empty cart', () => {
  assert.equal(sumGroupQuantityInCart([], ['tuna-soup']), 0)
})

test('sumGroupQuantityInCart: ignores items whose handle is not in the list', () => {
  const items = [{ handle: 'unrelated', quantity: 10 }]
  assert.equal(sumGroupQuantityInCart(items, ['tuna-soup']), 0)
})

test('unitPriceAtTier: percent tier with no anchor returns basePrice minus percentOff', () => {
  const tier = { minQty: 7, percentOff: 10 }
  assert.equal(unitPriceAtTier(1.99, tier), 1.791)
})

test('unitPriceAtTier: anchor tier returns anchorPrice divided by minQty', () => {
  const tier = { minQty: 7, percentOff: 5, anchorPrice: 10.0 }
  assert.equal(unitPriceAtTier(1.49, tier), 10.0 / 7)
})

test('unitPriceAtTier: fixed tier returns the clamped fixed price directly', () => {
  const tier = { minQty: 3, fixedPrice: 1.5 }
  assert.equal(unitPriceAtTier(1.99, tier), 1.5)
})

test('unitPriceAtTier: fixed price above base price clamps to base price, never a markup', () => {
  const tier = { minQty: 1, fixedPrice: 5.0 }
  assert.equal(unitPriceAtTier(1.49, tier), 1.49)
})

test('totalAtTier: fixed tier multiplies clamped unit price by minQty, rounded to whole pence', () => {
  const tier = { minQty: 3, fixedPrice: 1.5 }
  assert.equal(totalAtTier(1.99, tier), 4.5)
})

test('totalAtTier: anchor tier returns exactly the anchorPrice (minQty units, no extra accrual)', () => {
  const tier = { minQty: 7, percentOff: 5, anchorPrice: 10.0 }
  assert.equal(totalAtTier(1.49, tier), 10.0)
})

test('computeProgressState: below the lowest tier, no segments filled, not maxed', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 0, 1)

  assert.equal(state.combinedQty, 1)
  assert.equal(state.topThreshold, 20)
  assert.equal(state.cartPct, 0)
  assert.equal(state.addedPct, 5) // round(1/20*100)
  assert.equal(state.maxed, false)
})

test('computeProgressState: otherQty contributes its own bar segment, excluded from addedPct', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 2, 1)

  assert.equal(state.combinedQty, 3)
  assert.equal(state.cartPct, 10) // round(2/20*100)
  assert.equal(state.addedPct, 5) // round(1/20*100)
})

test('computeProgressState: callout percent is clamped between 6 and 94', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 20, percentOff: 10 }]
  const almostNothing = computeProgressState(tiers, 0, 1)
  assert.equal(almostNothing.calloutPct, 6)

  const almostFull = computeProgressState(tiers, 0, 19)
  assert.equal(almostFull.calloutPct, 94) // raw 95, clamped down
})

test('computeProgressState: reaching the top tier reports maxed and a 0 tierRemaining', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 2, 18)

  assert.equal(state.combinedQty, 20)
  assert.equal(state.maxed, true)
  assert.equal(state.tierState.nextTier, null)
})

test('computeProgressState: addedPct never exceeds the remaining room left by cartPct, even if otherQty alone already maxes the bar', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 25, 3)

  assert.equal(state.cartPct, 100)
  assert.equal(state.addedPct, 0)
  assert.equal(state.combinedQty, 28)
  assert.equal(state.maxed, true)
})

test('computeProgressState: tierButtons marks exactly the button matching addingQty as active, ignoring otherQty', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 5, 7)

  assert.deepEqual(state.tierButtons, [
    { minQty: 1, active: false },
    { minQty: 7, active: true },
    { minQty: 20, active: false },
  ])
})

test('computeProgressState: tempBox appears between two tiers based on addingQty alone, not combinedQty', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const between = computeProgressState(tiers, 10, 3) // addingQty 3 is between 1 and 7
  // tier is the lower/already-crossed boundary (the qty:1 anchor here), not
  // the not-yet-reached tier above it — see withUnitAnchor's doc comment.
  assert.deepEqual(between.tempBox, { afterIndex: 0, tier: { minQty: 1, percentOff: 0 } })

  const atExactTier = computeProgressState(tiers, 10, 7)
  assert.equal(atExactTier.tempBox, null)

  const pastTop = computeProgressState(tiers, 10, 25)
  assert.equal(pastTop.tempBox, null)
})

test('computeProgressState: tempBox between two real (already-configured) tiers prices at the lower, already-active one', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const between = computeProgressState(tiers, 0, 10) // addingQty 10 is between 7 and 20
  assert.deepEqual(between.tempBox, { afterIndex: 1, tier: { minQty: 7, percentOff: 5 } })
})

test('computeProgressState: a single-tier discount has no tempBox and a top threshold equal to that one tier', () => {
  const tiers = [{ minQty: 5, percentOff: 10 }]
  const state = computeProgressState(tiers, 0, 2)

  assert.equal(state.topThreshold, 5)
  assert.equal(state.tempBox, null)
  assert.deepEqual(state.tierButtons, [{ minQty: 5, active: false }])
})

test('computeTierButtonsSignature: differs when addingQty changes within the same inter-tier gap', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const stateAt2 = computeProgressState(tiers, 0, 2)
  const stateAt3 = computeProgressState(tiers, 0, 3)

  // Both 2 and 3 sit strictly between tiers 1 and 7, so tierButtons/tempBox
  // shape is identical — only addingQty differs.
  assert.deepEqual(stateAt2.tierButtons, stateAt3.tierButtons)
  assert.deepEqual(stateAt2.tempBox, stateAt3.tempBox)

  const sigAt2 = computeTierButtonsSignature(stateAt2, 1.49, 2)
  const sigAt3 = computeTierButtonsSignature(stateAt3, 1.49, 3)
  assert.notEqual(sigAt2, sigAt3)
})

test('computeTierButtonsSignature: differs when basePrice changes (e.g. variant switch), even with identical tierButtons/tempBox/addingQty', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 0, 3)

  const sigOldPrice = computeTierButtonsSignature(state, 1.49, 3)
  const sigNewPrice = computeTierButtonsSignature(state, 2.99, 3)
  assert.notEqual(sigOldPrice, sigNewPrice)
})

test('computeTierButtonsSignature: identical state/addingQty/basePrice produce an equal signature, preserving poll-suppression', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const stateA = computeProgressState(tiers, 0, 3)
  const stateB = computeProgressState(tiers, 0, 3)

  const sigA = computeTierButtonsSignature(stateA, 1.49, 3)
  const sigB = computeTierButtonsSignature(stateB, 1.49, 3)
  assert.equal(sigA, sigB)
})

function fmt(n) {
  return '£' + n.toFixed(2)
}

test('formatCalloutText: below the top tier shows progress toward the next tier', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 2, 1)
  const text = formatCalloutText(state, tiers, 1.49, fmt)
  assert.equal(text, '3 of 7 · 4 more for £1.42')
})

test('formatCalloutText: at the top tier shows the combined total and final price, no "more for"', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 12, 8)
  const text = formatCalloutText(state, tiers, 1.49, fmt)
  assert.equal(text, '20 combined · £1.34 each')
})

test('formatCalloutText: next tier is a fixed price above base price, clamps to base price (never a markup)', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, fixedPrice: 5.0 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 2, 1)
  const text = formatCalloutText(state, tiers, 1.49, fmt)
  assert.equal(text, '3 of 7 · 4 more for £1.49')
})

test('formatCalloutText: below every tier (no tier with minQty 1), falls back to remainingTiers instead of throwing on a null nextTier', () => {
  const tiers = [{ minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 0, 1)
  const text = formatCalloutText(state, tiers, 1.49, fmt)
  assert.equal(text, '1 of 7 · 6 more for £1.42')
})

test('computeProgressState: below every tier (no tier with minQty 1) does not throw, and documents that nextTier is null while remainingTiers is populated', () => {
  const tiers = [{ minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 0, 1)

  assert.equal(state.combinedQty, 1)
  assert.equal(state.maxed, false)
  assert.equal(state.tierState.nextTier, null)
  assert.deepEqual(state.tierState.remainingTiers, [
    { minQty: 7, percentOff: 5, fixedPrice: null, delta: 6 },
    { minQty: 20, percentOff: 10, fixedPrice: null, delta: 19 },
  ])
})

test('formatTempBoxLabel: quantity, "x", the running total at the already-active (lower) tier\'s rate — no "=" sign', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 0, 5)
  const label = formatTempBoxLabel(state, 1.49, 5, fmt)
  // 5 sits between the qty:1 anchor (0% off) and the 7-tier — no discount
  // is active yet, so the preview is 5 units at plain base price: 5 * 1.49 = 7.45
  assert.equal(label, '5x £7.45')
})

test('formatTempBoxLabel: between two real tiers, previews at the lower tier\'s already-unlocked rate', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 0, 10)
  const label = formatTempBoxLabel(state, 1.49, 10, fmt)
  // 10 sits between the 7-tier (5% off, already active) and the 20-tier —
  // preview uses the 7-tier's unlocked rate: unit 1.4155, 10 * 1.4155 = 14.155 -> 14.16
  assert.equal(label, '10x £14.16')
})

test('withUnitAnchor: prepends a { minQty: 1, percentOff: 0 } tier when none is configured', () => {
  const tiers = [{ minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  assert.deepEqual(withUnitAnchor(tiers), [
    { minQty: 1, percentOff: 0 },
    { minQty: 7, percentOff: 5 },
    { minQty: 20, percentOff: 10 },
  ])
})

test('withUnitAnchor: leaves an already-configured minQty:1 tier untouched, no duplicate', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }]
  assert.deepEqual(withUnitAnchor(tiers), tiers)
})

test('withUnitAnchor: passes through empty/missing tiers unchanged', () => {
  assert.equal(withUnitAnchor([]).length, 0)
  assert.equal(withUnitAnchor(null), null)
  assert.equal(withUnitAnchor(undefined), undefined)
})

test('buildPromoText: group mode with a title uses "Mix & match any {title}"', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const text = buildPromoText(tiers, 1.49, fmt, true, 'Canagan treat')
  assert.equal(text, 'Mix & match any Canagan treat — 7+ unlocks £1.42 each, 20+ unlocks £1.34 each')
})

test('buildPromoText: group mode with no title falls back to generic copy', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }]
  const text = buildPromoText(tiers, 1.49, fmt, true, undefined)
  assert.equal(text, 'Mix & match — 7+ unlocks £1.42 each')
})

test('buildPromoText: standalone mode with a title uses "Buy more {title}"', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }]
  const text = buildPromoText(tiers, 1.49, fmt, false, 'Canagan Tuna Soup')
  assert.equal(text, 'Buy more Canagan Tuna Soup — 7+ unlocks £1.42 each')
})

test('buildPromoText: standalone mode with no title falls back to generic copy', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }]
  const text = buildPromoText(tiers, 1.49, fmt, false, '')
  assert.equal(text, 'Buy more, save more — 7+ unlocks £1.42 each')
})

test('computeOrderSummary: no discount, no savings line', () => {
  const summary = computeOrderSummary(1.49, 3, 1.49)
  assert.equal(summary.total, 4.47)
  assert.equal(summary.fullPrice, 4.47)
  assert.equal(summary.savings, 0)
})

test('computeOrderSummary: discounted unit price reports savings vs full price', () => {
  const summary = computeOrderSummary(1.49, 5, 1.42)
  assert.equal(summary.total, 7.1)
  assert.equal(summary.fullPrice, 7.45)
  assert.equal(summary.savings, 0.35)
})
