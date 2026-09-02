const test = require('node:test')
const assert = require('node:assert/strict')
const { computeTierState, perUnitPrice, extractNumericId, sumMemberQuantityInCart, resolveEligibility, unitPriceAtTier, totalAtTier, computeProgressState, computeProgressTrack, pluralizeTitle, formatAddMoreText, formatTempBoxLabel, joinNaturally, buildPromoText, computeOrderSummary, computeTierButtonsSignature, withUnitAnchor, cartBaselineOtherQty, clamp, sortTiersByMinQty, normalizeTierPricing, formatMoney, computeWidgetViewModel, buildMixMatchRows, buildDisplayMixMatchItems } = require('../product-tier-pricing/assets/tier-pricing.js')

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

test('extractNumericId: pulls the trailing numeric id off a GID', () => {
  assert.equal(extractNumericId('gid://shopify/ProductVariant/123456'), '123456')
})

test('extractNumericId: passes through a value that is already a plain numeric id', () => {
  assert.equal(extractNumericId('123456'), '123456')
})

test('sumMemberQuantityInCart: whole-product member matches any variant of that product', () => {
  const cartItems = [
    { product_id: 1, variant_id: 10, quantity: 3 },
    { product_id: 1, variant_id: 11, quantity: 2 },
    { product_id: 2, variant_id: 20, quantity: 1 },
  ]
  const total = sumMemberQuantityInCart(cartItems, [{ productId: '1' }])
  assert.equal(total, 5)
})

test('sumMemberQuantityInCart: variant-scoped member matches only that exact variant', () => {
  const cartItems = [
    { product_id: 1, variant_id: 10, quantity: 3 },
    { product_id: 1, variant_id: 11, quantity: 2 },
  ]
  const total = sumMemberQuantityInCart(cartItems, [{ productId: '1', variantId: '10' }])
  assert.equal(total, 3)
})

test('sumMemberQuantityInCart: sums across multiple members, mixing whole-product and variant-scoped', () => {
  const cartItems = [
    { product_id: 1, variant_id: 10, quantity: 3 },
    { product_id: 2, variant_id: 20, quantity: 4 },
    { product_id: 2, variant_id: 21, quantity: 1 },
  ]
  const total = sumMemberQuantityInCart(cartItems, [{ productId: '1' }, { productId: '2', variantId: '20' }])
  assert.equal(total, 7)
})

test('sumMemberQuantityInCart: two variants of the SAME product both count toward the combined total', () => {
  const cartItems = [
    { product_id: 1, variant_id: 500, quantity: 4 },
    { product_id: 1, variant_id: 501, quantity: 3 },
    { product_id: 1, variant_id: 502, quantity: 10 }, // a third variant of the product, NOT a member — must not count
  ]
  const members = [{ productId: '1', variantId: '500' }, { productId: '1', variantId: '501' }]
  const total = sumMemberQuantityInCart(cartItems, members)
  assert.equal(total, 7)
})

test('resolveEligibility: null ownVariantIds means the whole (single-variant) product is always eligible', () => {
  assert.equal(resolveEligibility(null, '500'), true)
  assert.equal(resolveEligibility(null, '999'), true)
})

test('resolveEligibility: a non-null list is eligible only when the selected variant is in it', () => {
  assert.equal(resolveEligibility(['500', '501'], '500'), true)
  assert.equal(resolveEligibility(['500', '501'], '502'), false)
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

test('computeProgressState: below the lowest tier, small fill, not maxed', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 0, 1)

  assert.equal(state.combinedQty, 1)
  assert.equal(state.topThreshold, 20)
  assert.equal(state.maxed, false)
  // 3 stops (0, 7, 20) -> 2 equal 50%-wide segments. combinedQty 1 is
  // 1/7 of the way through the first segment: round(1/7 * 50) = 7.
  assert.equal(state.fillPct, 7)
  assert.deepEqual(state.stops, [
    { value: 0, active: true },
    { value: 7, active: false },
    { value: 20, active: false },
  ])
})

test('computeProgressState: reaching the top tier reports maxed and a 0 tierRemaining', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 2, 18)

  assert.equal(state.combinedQty, 20)
  assert.equal(state.maxed, true)
  assert.equal(state.tierState.nextTier, null)
  assert.equal(state.fillPct, 100)
})

test('computeProgressState: combinedQty beyond every tier — fill maxes out at 100, every stop reads active', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 25, 3)

  assert.equal(state.combinedQty, 28)
  assert.equal(state.maxed, true)
  assert.equal(state.fillPct, 100)
  assert.deepEqual(state.stops, [
    { value: 0, active: true },
    { value: 20, active: true },
  ])
})

test('computeProgressTrack: stops start at 0 and are evenly spaced regardless of the value gap between tiers', () => {
  const sorted = [{ minQty: 1, percentOff: 0 }, { minQty: 16, percentOff: 3 }, { minQty: 24, percentOff: 6 }, { minQty: 32, percentOff: 10 }]
  const track = computeProgressTrack(sorted, 5)
  assert.deepEqual(track.stops.map((s) => s.value), [0, 16, 24, 32])
})

test('computeProgressTrack: fill position is interpolated within the current even-width segment, not linear across the whole range', () => {
  const sorted = [{ minQty: 1, percentOff: 0 }, { minQty: 16, percentOff: 3 }, { minQty: 24, percentOff: 6 }, { minQty: 32, percentOff: 10 }]
  // 4 stops -> 3 equal segments of 33.33% each. combinedQty 8 is halfway
  // through the first segment (0..16) despite that segment covering a much
  // larger value range than the other two — even spacing, not proportional.
  const track = computeProgressTrack(sorted, 8)
  assert.equal(track.fillPct, 17) // round(0 + 0.5 * 33.33)
})

// Buttons and the temp box are driven entirely by combinedQty (otherQty +
// addingQty) — the true cart total — never by addingQty alone. A button
// highlights only when combinedQty lands exactly on its minQty; any other
// combinedQty shows a dashed box with the true total, positioned after
// whichever tier is currently applied (which can be the last tier's own
// slot, putting the box to the right of every button).

test('computeProgressState: tierButtons reflect combinedQty, not addingQty — an addingQty that happens to equal a tier\'s minQty is not enough on its own', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 5, 7) // combined 12 -- doesn't land on any tier

  assert.deepEqual(state.tierButtons, [
    { minQty: 1, active: false },
    { minQty: 7, active: false },
    { minQty: 20, active: false },
  ])
  assert.deepEqual(state.tempBox, { afterIndex: 1, tier: { minQty: 7, percentOff: 5 } })
})

test('computeProgressState: combinedQty landing exactly on a tier highlights that button and shows no temp box', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]

  const atFloor = computeProgressState(tiers, 0, 1) // empty cart -- lands on the qty:1 anchor
  assert.deepEqual(atFloor.tierButtons, [
    { minQty: 1, active: true },
    { minQty: 7, active: false },
    { minQty: 20, active: false },
  ])
  assert.equal(atFloor.tempBox, null)

  const atRealTier = computeProgressState(tiers, 0, 7)
  assert.deepEqual(atRealTier.tierButtons, [
    { minQty: 1, active: false },
    { minQty: 7, active: true },
    { minQty: 20, active: false },
  ])
  assert.equal(atRealTier.tempBox, null)
})

test('computeProgressState: combinedQty between two tiers shows a temp box previewing the currently-applied (lower) tier\'s rate', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 0, 3)
  // tier is the lower/already-crossed boundary (the qty:1 anchor here), not
  // the not-yet-reached tier above it — see withUnitAnchor's doc comment.
  assert.deepEqual(state.tempBox, { afterIndex: 0, tier: { minQty: 1, percentOff: 0 } })
})

test('computeProgressState: combinedQty past the last tier shows a temp box after the last button, not null', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 0, 25)
  assert.deepEqual(state.tempBox, { afterIndex: 2, tier: { minQty: 20, percentOff: 10 } })
  assert.deepEqual(state.tierButtons, [
    { minQty: 1, active: false },
    { minQty: 7, active: false },
    { minQty: 20, active: false },
  ])
})

test('computeProgressState: otherQty pushing combinedQty past a tier is reflected the same way as addingQty doing it — a temp box, not a highlighted button', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 10, 3) // combined 13 -- otherQty alone already crossed the 7-tier
  assert.deepEqual(state.tempBox, { afterIndex: 1, tier: { minQty: 7, percentOff: 5 } })
  assert.deepEqual(state.tierButtons, [
    { minQty: 1, active: false },
    { minQty: 7, active: false },
    { minQty: 20, active: false },
  ])
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

test('pluralizeTitle: appends "s" for a singular title when quantity is more than one', () => {
  assert.equal(pluralizeTitle('Canagan Cat Soup', 5), 'Canagan Cat Soups')
})

test('pluralizeTitle: leaves an already-plural title untouched — real configured titles mix conventions', () => {
  assert.equal(pluralizeTitle('Canagan Wet Cat Tins', 5), 'Canagan Wet Cat Tins')
})

test('pluralizeTitle: a quantity of exactly one keeps the title as configured, even if it reads plural', () => {
  assert.equal(pluralizeTitle('Canagan Cat Soup', 1), 'Canagan Cat Soup')
  assert.equal(pluralizeTitle('Canagan Wet Cat Tins', 1), 'Canagan Wet Cat Tins')
})

test('formatAddMoreText: with a title, states how many are already in the cart and how many more to add', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 4 }]
  const state = computeProgressState(tiers, 4, 1) // 5 combined, matches the "5 in cart" worked example
  const text = formatAddMoreText(state, tiers, 1.49, fmt, 'Canagan Cat Soups')
  assert.equal(text, 'You have 5 Canagan Cat Soups, add 2 to get them for £1.43')
})

test('formatAddMoreText: a singular configured title pluralizes for a combined quantity above one', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 4 }]
  const state = computeProgressState(tiers, 4, 1)
  const text = formatAddMoreText(state, tiers, 1.49, fmt, 'Canagan Cat Soup')
  assert.equal(text, 'You have 5 Canagan Cat Soups, add 2 to get them for £1.43')
})

test('formatAddMoreText: combined quantity of exactly one keeps the title singular', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 4 }]
  const state = computeProgressState(tiers, 0, 1) // 1 combined
  const text = formatAddMoreText(state, tiers, 1.49, fmt, 'Canagan Cat Soup')
  assert.equal(text, 'You have 1 Canagan Cat Soup, add 6 to get them for £1.43')
})

test('formatAddMoreText: no title configured — falls back to the generic instruction, no "You have"', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 4 }]
  const state = computeProgressState(tiers, 4, 1)
  const text = formatAddMoreText(state, tiers, 1.49, fmt, undefined)
  assert.equal(text, 'Add 2 more to get them for £1.43')
})

test('formatAddMoreText: next tier is a fixed price above base price, clamps to base price (never a markup)', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, fixedPrice: 5.0 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 2, 1) // 3 combined
  const text = formatAddMoreText(state, tiers, 1.49, fmt, undefined)
  assert.equal(text, 'Add 4 more to get them for £1.49')
})

test('formatAddMoreText: below every tier (no tier with minQty 1), falls back to remainingTiers instead of throwing on a null nextTier', () => {
  const tiers = [{ minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 0, 1)
  const text = formatAddMoreText(state, tiers, 1.49, fmt, undefined)
  assert.equal(text, 'Add 6 more to get them for £1.42')
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
  const label = formatTempBoxLabel(state, 1.49, fmt)
  // 5 sits between the qty:1 anchor (0% off) and the 7-tier — no discount
  // is active yet, so the preview is 5 units at plain base price: 5 * 1.49 = 7.45
  assert.equal(label, '5x £7.45')
})

test('formatTempBoxLabel: between two real tiers, previews at the lower tier\'s already-unlocked rate', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 0, 10)
  const label = formatTempBoxLabel(state, 1.49, fmt)
  // 10 sits between the 7-tier (5% off, already active) and the 20-tier —
  // preview uses the 7-tier's unlocked rate: unit 1.4155, 10 * 1.4155 = 14.155 -> 14.16
  assert.equal(label, '10x £14.16')
})

test('formatTempBoxLabel: uses the true combined quantity, not addingQty alone — 6 already in cart on page load shows "6x", not "1x"', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 4 }]
  const otherQty = cartBaselineOtherQty(6) // 5 -- page just loaded, stepper at its floor of 1
  const state = computeProgressState(tiers, otherQty, 1)
  assert.equal(state.combinedQty, 6)
  const label = formatTempBoxLabel(state, 1.49, fmt)
  // 6 sits between the qty:1 anchor and the 7-tier -- no discount active
  // yet, so 6 units at plain base price: 6 * 1.49 = 8.94
  assert.equal(label, '6x £8.94')
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

test('cartBaselineOtherQty: empty cart contributes nothing', () => {
  assert.equal(cartBaselineOtherQty(0), 0)
})

test('cartBaselineOtherQty: exactly 1 already in cart also contributes nothing (matches the stepper\'s own floor)', () => {
  assert.equal(cartBaselineOtherQty(1), 0)
})

test('cartBaselineOtherQty: subtracts the stepper\'s floor of 1 from the true cart total', () => {
  assert.equal(cartBaselineOtherQty(7), 6)
  assert.equal(cartBaselineOtherQty(100), 99)
})

test('cartBaselineOtherQty: never goes negative even if called with an impossible sub-1 total', () => {
  assert.equal(cartBaselineOtherQty(-3), 0)
})

test('combinedQty end-to-end: on load with 7 already in cart (across this product + siblings), combined reads exactly 7, then tracks the stepper 1-for-1 in both directions, floored at 7', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 4 }]
  const otherQty = cartBaselineOtherQty(7) // 6

  // Fresh page load: stepper at its native floor of 1.
  assert.equal(computeProgressState(tiers, otherQty, 1).combinedQty, 7)

  // Customer clicks "+" twice.
  assert.equal(computeProgressState(tiers, otherQty, 2).combinedQty, 8)
  assert.equal(computeProgressState(tiers, otherQty, 3).combinedQty, 9)

  // Customer clicks "-" back down; the stepper's own floor of 1 is the
  // lowest it can go, which lands combined back exactly on the cart total.
  assert.equal(computeProgressState(tiers, otherQty, 2).combinedQty, 8)
  assert.equal(computeProgressState(tiers, otherQty, 1).combinedQty, 7)
})

test('joinNaturally: reads like a spoken list rather than a mechanical dump', () => {
  assert.equal(joinNaturally(['A']), 'A')
  assert.equal(joinNaturally(['A', 'B']), 'A or B')
  assert.equal(joinNaturally(['A', 'B', 'C']), 'A, B, or C')
})

test('buildPromoText: group mode with a title, single tier — matches the "Canagan Cat Soup" worked example', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 4, anchorPrice: 10 }]
  const text = buildPromoText(tiers, 1.49, fmt, true, 'Canagan Cat Soup')
  assert.equal(text, 'Mix and match any Canagan Cat Soup and get 7 or more for £1.43')
})

test('buildPromoText: group mode with a title, several tiers — lists each threshold naturally', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const text = buildPromoText(tiers, 1.49, fmt, true, 'Canagan treat')
  assert.equal(text, 'Mix and match any Canagan treat and get 7 or more for £1.42 or 20 or more for £1.34')
})

test('buildPromoText: group mode with no title falls back to generic copy', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }]
  const text = buildPromoText(tiers, 1.49, fmt, true, undefined)
  assert.equal(text, 'Mix and match and get 7 or more for £1.42')
})

test('buildPromoText: standalone mode with a title', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }]
  const text = buildPromoText(tiers, 1.49, fmt, false, 'Canagan Tuna Soup')
  assert.equal(text, 'Buy Canagan Tuna Soup and get 7 or more for £1.42')
})

test('buildPromoText: standalone mode with no title falls back to generic copy', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }]
  const text = buildPromoText(tiers, 1.49, fmt, false, '')
  assert.equal(text, 'Buy more and get 7 or more for £1.42')
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

test('clamp: returns the value unchanged when within range', () => {
  assert.equal(clamp(5, 0, 10), 5)
})

test('clamp: floors at min', () => {
  assert.equal(clamp(-5, 0, 10), 0)
})

test('clamp: ceilings at max', () => {
  assert.equal(clamp(15, 0, 10), 10)
})

test('sortTiersByMinQty: sorts ascending by minQty without mutating the input', () => {
  const tiers = [{ minQty: 20 }, { minQty: 1 }, { minQty: 7 }]
  const sorted = sortTiersByMinQty(tiers)
  assert.deepEqual(sorted.map((t) => t.minQty), [1, 7, 20])
  assert.deepEqual(tiers.map((t) => t.minQty), [20, 1, 7]) // original untouched
})

test('normalizeTierPricing: fills in defaults for an unset tier', () => {
  assert.deepEqual(normalizeTierPricing({ minQty: 7 }), { percentOff: 0, anchorPrice: null, fixedPrice: null })
})

test('normalizeTierPricing: passes through explicit values', () => {
  assert.deepEqual(
    normalizeTierPricing({ minQty: 7, percentOff: 5, anchorPrice: 10, fixedPrice: 1.5 }),
    { percentOff: 5, anchorPrice: 10, fixedPrice: 1.5 },
  )
})

test('formatMoney: fills the {{amount}} placeholder with 2 decimal places', () => {
  assert.equal(formatMoney(1.5, '£{{amount}}'), '£1.50')
  assert.equal(formatMoney(9.999, '£{{ amount }}'), '£10.00')
})

test('buildMixMatchRows: builds one row per product with its live cart quantity and product-page link', () => {
  const products = [
    { title: 'Canagan Tuna Soup for Cats', handle: 'canagan-tuna-soup-for-cats', productId: 'gid://shopify/Product/1', imageUrl: 'https://example.com/tuna.png' },
    { title: 'Canagan Chicken Soup for Cats', handle: 'canagan-chicken-soup-for-cats', productId: 'gid://shopify/Product/2', imageUrl: null },
  ]
  const cartItems = [
    { product_id: 1, variant_id: 10, quantity: 5 },
    { product_id: 3, variant_id: 30, quantity: 2 },
  ]
  assert.deepEqual(buildMixMatchRows(products, cartItems), [
    { href: '/products/canagan-tuna-soup-for-cats', title: 'Canagan Tuna Soup for Cats', imageUrl: 'https://example.com/tuna.png', qtyLabel: '5 in cart' },
    { href: '/products/canagan-chicken-soup-for-cats', title: 'Canagan Chicken Soup for Cats', imageUrl: null, qtyLabel: '0 in cart' },
  ])
})

test('buildMixMatchRows: singular "1 in cart" label', () => {
  const rows = buildMixMatchRows(
    [{ title: 'X', handle: 'x', productId: 'gid://shopify/Product/9', imageUrl: null }],
    [{ product_id: 9, variant_id: 90, quantity: 1 }],
  )
  assert.equal(rows[0].qtyLabel, '1 in cart')
})

test('buildMixMatchRows: a variant-scoped member matches only that exact variant\'s cart quantity', () => {
  const rows = buildMixMatchRows(
    [{ title: 'X', handle: 'x', productId: 'gid://shopify/Product/9', variantId: 'gid://shopify/ProductVariant/90', imageUrl: null }],
    [
      { product_id: 9, variant_id: 90, quantity: 3 },
      { product_id: 9, variant_id: 91, quantity: 4 },
    ],
  )
  assert.equal(rows[0].qtyLabel, '3 in cart')
})

test('buildMixMatchRows: a variant-scoped member deep-links with a ?variant= query param', () => {
  const rows = buildMixMatchRows(
    [{ title: 'Salmon', handle: 'wet-cat-food', productId: 'gid://shopify/Product/9', variantId: 'gid://shopify/ProductVariant/90', imageUrl: null }],
    [],
  )
  assert.equal(rows[0].href, '/products/wet-cat-food?variant=90')
})

test('buildMixMatchRows: a whole-product member links to the plain product URL, no query param', () => {
  const rows = buildMixMatchRows(
    [{ title: 'Tuna', handle: 'tuna-soup', productId: 'gid://shopify/Product/1', imageUrl: null }],
    [],
  )
  assert.equal(rows[0].href, '/products/tuna-soup')
})

test('buildDisplayMixMatchItems: includes this product\'s own other member-variants, excluding the currently-displayed one', () => {
  const config = {
    productId: '2',
    productHandle: 'wet-cat-food',
    ownVariantOptions: [
      { variantId: '20', title: 'Chicken' },
      { variantId: '21', title: 'Salmon' },
      { variantId: '22', title: 'Duck' },
    ],
    mixMatchListItems: [],
  }
  const items = buildDisplayMixMatchItems(config, '21') // viewing Salmon
  assert.deepEqual(items, [
    { productId: '2', variantId: '20', title: 'Chicken', handle: 'wet-cat-food', imageUrl: null },
    { productId: '2', variantId: '22', title: 'Duck', handle: 'wet-cat-food', imageUrl: null },
  ])
})

test('buildDisplayMixMatchItems: cross-product siblings are appended after this product\'s own-variant rows', () => {
  const config = {
    productId: '2',
    productHandle: 'wet-cat-food',
    ownVariantOptions: [{ variantId: '20', title: 'Chicken' }],
    mixMatchListItems: [{ productId: 'gid://shopify/Product/1', title: 'Tuna Soup', handle: 'tuna-soup', imageUrl: null }],
  }
  const items = buildDisplayMixMatchItems(config, '20') // viewing Chicken -- excludes itself
  assert.deepEqual(items, [
    { productId: 'gid://shopify/Product/1', title: 'Tuna Soup', handle: 'tuna-soup', imageUrl: null },
  ])
})

test('buildDisplayMixMatchItems: single-variant product (no ownVariantOptions) returns just the siblings', () => {
  const config = {
    productId: '1',
    productHandle: 'tuna-soup',
    ownVariantOptions: [],
    mixMatchListItems: [{ productId: 'gid://shopify/Product/2', title: 'Wet Cat Food', handle: 'wet-cat-food', imageUrl: null }],
  }
  const items = buildDisplayMixMatchItems(config, null)
  assert.deepEqual(items, [
    { productId: 'gid://shopify/Product/2', title: 'Wet Cat Food', handle: 'wet-cat-food', imageUrl: null },
  ])
})

test('computeWidgetViewModel: no tiers configured at all — plain price, card hidden, breakdown left untouched', () => {
  const vm = computeWidgetViewModel({ tiers: [], basePrice: 1.49, otherQty: 0, addingQty: 1, title: undefined, isGroup: false, formatMoney: fmt })
  assert.deepEqual(vm, {
    showCard: false,
    discountedPrice: null,
    plainPrice: '£1.49',
    promoText: '',
    progressState: null,
    tierButtons: [],
    tempBoxLabel: null,
    tempBoxAfterIndex: null,
    breakdownText: null,
  })
})

test('computeWidgetViewModel: no tiers, but a native compare-at price is set — falls back to showing it crossed out', () => {
  const vm = computeWidgetViewModel({ tiers: [], basePrice: 1.49, compareAtPrice: 1.99, otherQty: 0, addingQty: 1, title: undefined, isGroup: false, formatMoney: fmt })
  assert.equal(vm.showCard, false) // still just a price-row fallback, not the full tiered-discount card
  assert.equal(vm.discountedPrice, '£1.49')
  assert.equal(vm.plainPrice, '£1.99') // crossed out, matching the app-discount styling
})

test('computeWidgetViewModel: no tiers, compare-at price equal to or below the selling price — no fake markdown', () => {
  const vmEqual = computeWidgetViewModel({ tiers: [], basePrice: 1.49, compareAtPrice: 1.49, otherQty: 0, addingQty: 1, title: undefined, isGroup: false, formatMoney: fmt })
  assert.equal(vmEqual.discountedPrice, null)
  assert.equal(vmEqual.plainPrice, '£1.49')

  const vmZero = computeWidgetViewModel({ tiers: [], basePrice: 1.49, compareAtPrice: 0, otherQty: 0, addingQty: 1, title: undefined, isGroup: false, formatMoney: fmt })
  assert.equal(vmZero.discountedPrice, null)
  assert.equal(vmZero.plainPrice, '£1.49')
})

test('computeWidgetViewModel: fresh page load, qty 1, below the discount tier — no strike-through, low progress fill', () => {
  // Mirrors a real group-mode load: otherQty from cartBaselineOtherQty(0) = 0.
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 4 }]
  const vm = computeWidgetViewModel({ tiers, basePrice: 1.49, otherQty: 0, addingQty: 1, title: undefined, isGroup: true, formatMoney: fmt })

  assert.equal(vm.showCard, true)
  assert.equal(vm.discountedPrice, null) // 0% off at qty 1 — not actually discounted yet
  assert.equal(vm.plainPrice, '£1.49')
  assert.equal(vm.promoText, 'Mix and match and get 7 or more for £1.43')
  assert.deepEqual(vm.progressState.stops, [
    { value: 0, active: true },
    { value: 7, active: false },
  ])
  assert.deepEqual(vm.tierButtons, [
    { minQty: 1, active: true, label: '1 x £1.49' },
    { minQty: 7, active: false, label: '7 x £10.01' },
  ])
  assert.equal(vm.tempBoxLabel, null) // addingQty sits exactly at the qty:1 anchor, not strictly between two tiers
  // Below the top tier, the breakdown line becomes the "add more" instruction
  // instead of the addingQty × price line — no title configured here, so it
  // reads cleanly without a product name.
  assert.equal(vm.breakdownText, 'Add 6 more to get them for £1.43')
})

test('computeWidgetViewModel: discount title flows through to the breakdown line — "5 in cart" worked example', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 4 }]
  const vm = computeWidgetViewModel({ tiers, basePrice: 1.49, otherQty: 4, addingQty: 1, title: 'Canagan Cat Soups', isGroup: true, formatMoney: fmt })

  assert.equal(vm.breakdownText, 'You have 5 Canagan Cat Soups, add 2 to get them for £1.43')
})

test('computeWidgetViewModel: combined quantity already past the tier threshold (cart-aware baseline + 2 clicks) — matches the live-verified "9 combined" scenario', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 4 }]
  const otherQty = cartBaselineOtherQty(7) // 7 already in cart across this product + siblings
  const vm = computeWidgetViewModel({ tiers, basePrice: 1.49, otherQty, addingQty: 3, title: undefined, isGroup: true, formatMoney: fmt })

  assert.equal(vm.discountedPrice, '£1.43')
  // combined (9) doesn't land exactly on either preset (1 or 7), so neither
  // button highlights — instead a temp box shows the true combined total
  // (9, not addingQty's 3), positioned after the 7-tier button (the last
  // one), previewing at the already-unlocked 7-tier rate.
  assert.deepEqual(vm.tierButtons, [
    { minQty: 1, active: false, label: '1 x £1.49' },
    { minQty: 7, active: false, label: '7 x £10.01' },
  ])
  assert.equal(vm.tempBoxLabel, '9x £12.87')
  assert.equal(vm.tempBoxAfterIndex, 1)
  assert.equal(vm.breakdownText, '3 units × £1.43 · full price £4.47 — you save £0.18')
})

test('computeWidgetViewModel: standalone mode (isGroup false) uses "Buy more" promo copy', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 4 }]
  const vm = computeWidgetViewModel({ tiers, basePrice: 1.49, otherQty: 0, addingQty: 1, title: 'Canagan Tuna Soup', isGroup: false, formatMoney: fmt })
  assert.equal(vm.promoText, 'Buy Canagan Tuna Soup and get 7 or more for £1.43')
})
