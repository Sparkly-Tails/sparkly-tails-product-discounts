const test = require('node:test')
const assert = require('node:assert/strict')
const { isTimeDiscountWindowActive, tierTimeDiscountItems, tierTimeDiscountItemFor, timeDiscountSalePrice, computeTierState, perUnitPrice, extractNumericId, sumMemberQuantityInCart, resolveEligibility, unitPriceAtTier, computeProgressState, formatTempBoxLabel, joinNaturally, computeOrderSummary, computeTierButtonsSignature, withUnitAnchor, cartBaselineOtherQty, clamp, sortTiersByMinQty, normalizeTierPricing, formatMoney, computeWidgetViewModel, buildMixMatchRows, buildProgressSemantics, formatItemsChosen, buildDisplayMixMatchItems, listedMixMatchItems, computeProgressDot, classifyOfferState, buildPromoLine, buildStatusCopy } = require('../product-tier-pricing/assets/tier-pricing.js')

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

test('computeProgressState: below the lowest tier, not maxed', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 0, 1)

  assert.equal(state.combinedQty, 1)
  assert.equal(state.topThreshold, 20)
  assert.equal(state.maxed, false)
})

test('computeProgressState: reaching the top tier reports maxed and a 0 tierRemaining', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 2, 18)

  assert.equal(state.combinedQty, 20)
  assert.equal(state.maxed, true)
  assert.equal(state.tierState.nextTier, null)
})

test('computeProgressState: combinedQty beyond every tier is still maxed', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 25, 3)

  assert.equal(state.combinedQty, 28)
  assert.equal(state.maxed, true)
})

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

test('formatTempBoxLabel: quantity, "×", the unit price at the already-active (lower) tier\'s rate', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 0, 5)
  const label = formatTempBoxLabel(state, 1.49, fmt)
  // 5 sits between the qty:1 anchor (0% off) and the 7-tier — no discount
  // is active yet, so the preview is 5 units at the plain base price
  assert.equal(label, '5 × £1.49')
})

test('formatTempBoxLabel: between two real tiers, previews at the lower tier\'s already-unlocked rate', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 5 }, { minQty: 20, percentOff: 10 }]
  const state = computeProgressState(tiers, 0, 10)
  const label = formatTempBoxLabel(state, 1.49, fmt)
  // 10 sits between the 7-tier (5% off, already active) and the 20-tier —
  // preview uses the 7-tier's unlocked rate: unit 1.4155 -> £1.42
  assert.equal(label, '10 × £1.42')
})

test('formatTempBoxLabel: uses the true combined quantity, not addingQty alone — 6 already in cart on page load shows "6 ×", not "1 ×"', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 4 }]
  const otherQty = cartBaselineOtherQty(6) // 5 -- page just loaded, stepper at its floor of 1
  const state = computeProgressState(tiers, otherQty, 1)
  assert.equal(state.combinedQty, 6)
  const label = formatTempBoxLabel(state, 1.49, fmt)
  // 6 sits between the qty:1 anchor and the 7-tier -- no discount active
  // yet, so 6 units at the plain base price
  assert.equal(label, '6 × £1.49')
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

test('buildDisplayMixMatchItems: includes every one of this product\'s own other member-variants, INCLUDING the currently-displayed one', () => {
  const config = {
    productId: '2',
    ownVariantOptions: [
      { variantId: '20', title: 'Chicken', url: '/products/wet-cat-food?variant=20', imageUrl: null, price: 169, available: true, cartVariantId: '20' },
      { variantId: '21', title: 'Salmon', url: '/products/wet-cat-food?variant=21', imageUrl: null, price: 169, available: true, cartVariantId: '21' },
      { variantId: '22', title: 'Duck', url: '/products/wet-cat-food?variant=22', imageUrl: null, price: 169, available: true, cartVariantId: '22' },
    ],
    mixMatchListItems: [],
  }
  const items = buildDisplayMixMatchItems(config) // viewing Salmon, but it still gets a row — a customer's own already-in-cart quantity for the variant they're on must stay visible
  assert.deepEqual(items, [
    { productId: '2', variantId: '20', title: 'Chicken', url: '/products/wet-cat-food?variant=20', imageUrl: null, price: 169, available: true, cartVariantId: '20' },
    { productId: '2', variantId: '21', title: 'Salmon', url: '/products/wet-cat-food?variant=21', imageUrl: null, price: 169, available: true, cartVariantId: '21' },
    { productId: '2', variantId: '22', title: 'Duck', url: '/products/wet-cat-food?variant=22', imageUrl: null, price: 169, available: true, cartVariantId: '22' },
  ])
})

test('buildDisplayMixMatchItems: cross-product siblings are appended after this product\'s own-variant rows', () => {
  const config = {
    productId: '2',
    ownVariantOptions: [{ variantId: '20', title: 'Chicken', url: '/products/wet-cat-food?variant=20', imageUrl: null, price: 169, available: true, cartVariantId: '20' }],
    mixMatchListItems: [{ productId: 'gid://shopify/Product/1', title: 'Tuna Soup', url: '/products/tuna-soup', imageUrl: null }],
  }
  const items = buildDisplayMixMatchItems(config)
  assert.deepEqual(items, [
    { productId: '2', variantId: '20', title: 'Chicken', url: '/products/wet-cat-food?variant=20', imageUrl: null, price: 169, available: true, cartVariantId: '20' },
    { productId: 'gid://shopify/Product/1', title: 'Tuna Soup', url: '/products/tuna-soup', imageUrl: null },
  ])
})

test('buildDisplayMixMatchItems: single-variant product (no ownVariantOptions) returns just the siblings', () => {
  const config = {
    productId: '1',
    ownVariantOptions: [],
    mixMatchListItems: [{ productId: 'gid://shopify/Product/2', title: 'Wet Cat Food', url: '/products/wet-cat-food', imageUrl: null }],
  }
  const items = buildDisplayMixMatchItems(config)
  assert.deepEqual(items, [
    { productId: 'gid://shopify/Product/2', title: 'Wet Cat Food', url: '/products/wet-cat-food', imageUrl: null },
  ])
})

test('listedMixMatchItems: leaves out siblings that no longer resolve, but never changes the list it was given', () => {
  const siblings = [
    { productId: 'gid://shopify/Product/1', title: 'Tuna Soup', url: '/products/tuna-soup', imageUrl: null, listed: true },
    { productId: 'gid://shopify/Product/2', title: null, url: null, imageUrl: null, listed: false },
  ]
  const listed = listedMixMatchItems(siblings)
  assert.deepEqual(listed, [siblings[0]])
  assert.equal(siblings.length, 2) // the unlisted one is still there for the combined-quantity count
})

test('listedMixMatchItems: no siblings at all gives an empty list', () => {
  assert.deepEqual(listedMixMatchItems(undefined), [])
  assert.deepEqual(listedMixMatchItems([]), [])
})

test('computeWidgetViewModel: no tiers configured at all — plain price, card hidden, no redesign copy', () => {
  const vm = computeWidgetViewModel({ tiers: [], basePrice: 1.49, otherQty: 0, addingQty: 1, isGroup: false, formatMoney: fmt })
  assert.deepEqual(vm, {
    showCard: false,
    discountedPrice: null,
    plainPrice: '£1.49',
    progressState: null,
    tierButtons: [],
    tempBoxLabel: null,
    tempBoxAfterIndex: null,
    offerState: null,
    dot: null,
    promoLine: '',
    status: null,
    semantics: null,
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

test('computeWidgetViewModel: fresh page load, qty 1, below the discount tier — no strike-through, dot on the start', () => {
  // Mirrors a real group-mode load: otherQty from cartBaselineOtherQty(0) = 0.
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 4 }]
  const vm = computeWidgetViewModel({ tiers, basePrice: 1.49, otherQty: 0, addingQty: 1, title: undefined, isGroup: true, formatMoney: fmt })

  assert.equal(vm.showCard, true)
  assert.equal(vm.discountedPrice, null) // 0% off at qty 1 — not actually discounted yet
  assert.equal(vm.plainPrice, '£1.49')
  assert.equal(vm.promoLine, 'Mix and match 7+ for £1.43')
  assert.deepEqual(vm.dot.markers, [
    { value: 1, pct: 0, reached: true, covered: true },
    { value: 7, pct: 100, reached: false, covered: false },
  ])
  assert.deepEqual(vm.tierButtons, [
    { minQty: 1, active: true, dimmed: false, label: '1 × £1.49' },
    { minQty: 7, active: false, dimmed: false, label: '7 × £1.43' },
  ])
  assert.equal(vm.tempBoxLabel, null) // addingQty sits exactly at the qty:1 anchor, not strictly between two tiers
  assert.equal(vm.status.statusText, 'You have 1 unit')
  assert.equal(vm.status.hintText, 'Add 6 for £1.43/ea')
})

test('computeWidgetViewModel: the status row counts the combined quantity — "5 in cart" worked example', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 4 }]
  const vm = computeWidgetViewModel({ tiers, basePrice: 1.49, otherQty: 4, addingQty: 1, isGroup: true, formatMoney: fmt })

  assert.equal(vm.status.statusText, 'You have 5 units')
  assert.equal(vm.status.hintText, 'Add 2 for £1.43/ea')
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
    { minQty: 1, active: false, dimmed: true, label: '1 × £1.49' },
    { minQty: 7, active: false, dimmed: false, label: '7 × £1.43' },
  ])
  assert.equal(vm.tempBoxLabel, '9 × £1.43')
  assert.equal(vm.tempBoxAfterIndex, 1)
  assert.equal(vm.offerState, 'highest')
  assert.equal(vm.status.headlineText, 'Highest discount unlocked: £1.43/each applied! (Save £0.54)')
})

test('computeWidgetViewModel: standalone mode (isGroup false) uses "Buy" promo copy', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 7, percentOff: 4 }]
  const vm = computeWidgetViewModel({ tiers, basePrice: 1.49, otherQty: 0, addingQty: 1, isGroup: false, formatMoney: fmt })
  assert.equal(vm.promoLine, 'Buy 7+ for £1.43')
})

// Time-based discount rows and sale price (major currency unit, like basePrice)

const V10 = 'gid://shopify/ProductVariant/10'
const V11 = 'gid://shopify/ProductVariant/11'

test('tierTimeDiscountItems: current metafields carry their own rows', () => {
  const items = [{ variantId: V10, pricingMode: 'fixed', amount: 22 }, { variantId: null, pricingMode: 'percent', amount: 10 }]
  assert.deepEqual(tierTimeDiscountItems({ items }), items)
})

test('tierTimeDiscountItems: an older metafield becomes one row per covered variant, or one whole-product row', () => {
  assert.deepEqual(
    tierTimeDiscountItems({ pricingMode: 'percent', amount: 20, variantIds: null }),
    [{ variantId: null, pricingMode: 'percent', amount: 20 }]
  )
  assert.deepEqual(
    tierTimeDiscountItems({ pricingMode: 'fixed', amount: 22, variantIds: [V10, V11] }),
    [{ variantId: V10, pricingMode: 'fixed', amount: 22 }, { variantId: V11, pricingMode: 'fixed', amount: 22 }]
  )
  assert.deepEqual(tierTimeDiscountItems({ pricingMode: 'percent', amount: 20, variantIds: [] }), [{ variantId: null, pricingMode: 'percent', amount: 20 }])
})

test('tierTimeDiscountItems: no rows without pricing data', () => {
  assert.deepEqual(tierTimeDiscountItems({ pricingMode: null, amount: null, variantIds: null }), [])
  assert.deepEqual(tierTimeDiscountItems({}), [])
})

test('tierTimeDiscountItemFor: the variant\'s own row wins over the whole-product row; GIDs and numeric ids both match', () => {
  const whole = { variantId: null, pricingMode: 'percent', amount: 10 }
  const own = { variantId: V10, pricingMode: 'fixed', amount: 5 }
  assert.equal(tierTimeDiscountItemFor([whole, own], '10'), own)
  assert.equal(tierTimeDiscountItemFor([whole, own], 10), own)
  assert.equal(tierTimeDiscountItemFor([whole, own], '11'), whole)
  assert.equal(tierTimeDiscountItemFor([own], '11'), null)
  assert.equal(tierTimeDiscountItemFor([], '10'), null)
})

test('timeDiscountSalePrice: fixed mode IS the final price, whatever the variant price is', () => {
  const discount = { items: [{ variantId: null, pricingMode: 'fixed', amount: 22 }] }
  assert.equal(timeDiscountSalePrice({ basePrice: 49.99, discount, variantId: '1' }), 22)
  assert.equal(timeDiscountSalePrice({ basePrice: 1000, discount: { items: [{ variantId: null, pricingMode: 'fixed', amount: 22.5 }] }, variantId: '1' }), 22.5)
})

test('timeDiscountSalePrice: percent mode takes the percentage off the variant\'s own price, rounded to pence', () => {
  const pct = (amount) => ({ items: [{ variantId: null, pricingMode: 'percent', amount }] })
  assert.equal(timeDiscountSalePrice({ basePrice: 20, discount: pct(20), variantId: '1' }), 16)
  assert.equal(timeDiscountSalePrice({ basePrice: 49.99, discount: pct(10), variantId: '1' }), 44.99)
  assert.equal(timeDiscountSalePrice({ basePrice: 59.99, discount: pct(12.5), variantId: '1' }), 52.49)
})

test('timeDiscountSalePrice: percent is clamped to 0-100', () => {
  const pct = (amount) => ({ items: [{ variantId: null, pricingMode: 'percent', amount }] })
  assert.equal(timeDiscountSalePrice({ basePrice: 20, discount: pct(150), variantId: '1' }), 0)
  assert.equal(timeDiscountSalePrice({ basePrice: 20, discount: pct(-5), variantId: '1' }), null)
})

test('timeDiscountSalePrice: every row has its own price — each variant gets its own rule', () => {
  const discount = { items: [{ variantId: V10, pricingMode: 'fixed', amount: 22 }, { variantId: V11, pricingMode: 'percent', amount: 50 }] }
  assert.equal(timeDiscountSalePrice({ basePrice: 49.99, discount, variantId: '10' }), 22)
  assert.equal(timeDiscountSalePrice({ basePrice: 60, discount, variantId: '11' }), 30)
  assert.equal(timeDiscountSalePrice({ basePrice: 60, discount, variantId: '12' }), null)
})

test('timeDiscountSalePrice: a variant row beats the whole-product row', () => {
  const discount = { items: [{ variantId: null, pricingMode: 'percent', amount: 10 }, { variantId: V10, pricingMode: 'fixed', amount: 5 }] }
  assert.equal(timeDiscountSalePrice({ basePrice: 20, discount, variantId: '10' }), 5)
  assert.equal(timeDiscountSalePrice({ basePrice: 20, discount, variantId: '11' }), 18)
})

test('timeDiscountSalePrice: an older single-rule metafield still works', () => {
  assert.equal(timeDiscountSalePrice({ basePrice: 49.99, discount: { pricingMode: 'fixed', amount: 22, variantIds: null }, variantId: '1' }), 22)
  assert.equal(timeDiscountSalePrice({ basePrice: 49.99, discount: { pricingMode: 'fixed', amount: 22, variantIds: [V10] }, variantId: '12' }), null)
  assert.equal(timeDiscountSalePrice({ basePrice: 49.99, discount: { pricingMode: 'fixed', amount: 22, variantIds: [V10] }, variantId: 10 }), 22)
})

test('timeDiscountSalePrice: null when the price would not actually be lower (checkout applies no discount)', () => {
  const fixed = (amount) => ({ items: [{ variantId: null, pricingMode: 'fixed', amount }] })
  assert.equal(timeDiscountSalePrice({ basePrice: 20, discount: fixed(25), variantId: '1' }), null)
  assert.equal(timeDiscountSalePrice({ basePrice: 20, discount: fixed(20), variantId: '1' }), null)
  assert.equal(timeDiscountSalePrice({ basePrice: 20, discount: { items: [{ variantId: null, pricingMode: 'percent', amount: 0 }] }, variantId: '1' }), null)
})

test('timeDiscountSalePrice: null without pricing data, without a discount, or without a usable base price', () => {
  assert.equal(timeDiscountSalePrice({ basePrice: 20, discount: { pricingMode: null, amount: null, variantIds: null }, variantId: '1' }), null)
  assert.equal(timeDiscountSalePrice({ basePrice: 20, discount: null, variantId: '1' }), null)
  assert.equal(timeDiscountSalePrice({ basePrice: Number.NaN, discount: { items: [{ variantId: null, pricingMode: 'fixed', amount: 5 }] }, variantId: '1' }), null)
  assert.equal(timeDiscountSalePrice({ basePrice: 20, discount: { items: [{ variantId: null, pricingMode: 'fixed', amount: undefined }] }, variantId: '1' }), null)
})

// Time-based discount window

test('isTimeDiscountWindowActive: active from startsAt up to, but not including, endsAt', () => {
  const d = { startsAt: '2026-06-01T00:00:00.000Z', endsAt: '2026-06-02T00:00:00.000Z' }
  assert.equal(isTimeDiscountWindowActive(d, new Date('2026-05-31T23:59:59.999Z')), false)
  assert.equal(isTimeDiscountWindowActive(d, new Date('2026-06-01T00:00:00.000Z')), true)
  assert.equal(isTimeDiscountWindowActive(d, new Date('2026-06-01T23:59:59.999Z')), true)
  assert.equal(isTimeDiscountWindowActive(d, new Date('2026-06-02T00:00:00.000Z')), false)
})

test('isTimeDiscountWindowActive: never active without both dates, with unparseable dates, or without a discount', () => {
  const now = new Date('2026-06-01T12:00:00.000Z')
  assert.equal(isTimeDiscountWindowActive({}, now), false)
  assert.equal(isTimeDiscountWindowActive({ startsAt: '2026-06-01T00:00:00.000Z' }, now), false)
  assert.equal(isTimeDiscountWindowActive({ startsAt: 'nope', endsAt: 'nope' }, now), false)
  assert.equal(isTimeDiscountWindowActive(null, now), false)
})

// Redesign view-model pieces (Stitch design). Tiers below always carry the
// synthetic minQty:1 anchor, as withUnitAnchor gives them in the widget.

const REDESIGN_TIERS = [{ minQty: 1, percentOff: 0 }, { minQty: 8, percentOff: 3.5503 }, { minQty: 16, percentOff: 8.2840 }]
// base £1.69: 8+ -> £1.63, 16+ -> £1.55 (the design's worked example)
const REDESIGN_BASE = 1.69
const REDESIGN_TIERS_FIXED = [{ minQty: 1, percentOff: 0 }, { minQty: 8, fixedPrice: 1.63 }, { minQty: 16, fixedPrice: 1.55 }]

test('computeProgressDot: the dot sits on the current quantity, evenly spaced markers start at the first tier and end at the last', () => {
  const dot = computeProgressDot(REDESIGN_TIERS, 5)
  assert.equal(dot.dotValue, 5)
  assert.equal(dot.dotPct, 29) // 4/7 of the first half = round(28.57)
  assert.deepEqual(dot.markers.map((m) => [m.value, m.pct, m.reached, m.covered]), [
    [1, 0, true, false],
    [8, 50, false, false],
    [16, 100, false, false],
  ])
})

test('computeProgressDot: a quantity exactly on a marker covers that marker', () => {
  const atStart = computeProgressDot(REDESIGN_TIERS, 1)
  assert.equal(atStart.dotPct, 0)
  assert.equal(atStart.markers[0].covered, true)
  const atTier = computeProgressDot(REDESIGN_TIERS, 8)
  assert.equal(atTier.dotPct, 50)
  assert.deepEqual(atTier.markers.map((m) => m.covered), [false, true, false])
  assert.deepEqual(atTier.markers.map((m) => m.reached), [true, true, false])
})

test('computeProgressDot: past the last tier the dot stays at the end but still shows the real quantity', () => {
  const dot = computeProgressDot(REDESIGN_TIERS, 20)
  assert.equal(dot.dotValue, 20)
  assert.equal(dot.dotPct, 100)
  assert.deepEqual(dot.markers.map((m) => m.reached), [true, true, true])
  assert.equal(dot.markers[2].covered, true)
})

test('computeProgressDot: segments are even-width whatever the value gaps; below the start the dot sits at 0', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 8, percentOff: 3 }, { minQty: 16, percentOff: 6 }, { minQty: 32, percentOff: 10 }]
  assert.equal(computeProgressDot(tiers, 12).dotPct, 50) // halfway through the 8..16 segment = 33.33 + 16.67
  assert.equal(computeProgressDot(tiers, 0).dotPct, 0)
})

test('classifyOfferState: below the first discount is progress, a middle tier is offer, the highest tier (and beyond) is highest', () => {
  const state = (qty) => classifyOfferState(computeProgressState(REDESIGN_TIERS, 0, qty), REDESIGN_BASE)
  assert.equal(state(1), 'progress')
  assert.equal(state(5), 'progress')
  assert.equal(state(8), 'offer')
  assert.equal(state(10), 'offer')
  assert.equal(state(16), 'highest')
  assert.equal(state(20), 'highest')
})

test('classifyOfferState: with one real tier, reaching it is the highest discount (there is no middle tier)', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 8, percentOff: 5 }]
  assert.equal(classifyOfferState(computeProgressState(tiers, 0, 8), 1.69), 'highest')
})

test('buildPromoLine: lists each real tier threshold with its unit price, no title', () => {
  assert.equal(buildPromoLine(REDESIGN_TIERS_FIXED, REDESIGN_BASE, fmt, true), 'Mix and match 8+ for £1.63 or 16+ for £1.55')
  assert.equal(buildPromoLine(REDESIGN_TIERS_FIXED, REDESIGN_BASE, fmt, false), 'Buy 8+ for £1.63 or 16+ for £1.55')
})

test('buildPromoLine: three real tiers read as a spoken list; no real tier gives an empty line', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 8, fixedPrice: 1.63 }, { minQty: 16, fixedPrice: 1.55 }, { minQty: 32, fixedPrice: 1.45 }]
  assert.equal(buildPromoLine(tiers, REDESIGN_BASE, fmt, true), 'Mix and match 8+ for £1.63, 16+ for £1.55, or 32+ for £1.45')
  assert.equal(buildPromoLine([{ minQty: 1, percentOff: 0 }], REDESIGN_BASE, fmt, true), '')
})

test('buildStatusCopy: below the first offer — units owned, hint to the next price, no badge', () => {
  const status = buildStatusCopy({ progressState: computeProgressState(REDESIGN_TIERS_FIXED, 4, 1), tiers: REDESIGN_TIERS_FIXED, basePrice: REDESIGN_BASE, formatMoney: fmt })
  assert.deepEqual(status, { state: 'progress', statusText: 'You have 5 units', hintText: 'Add 3 for £1.63/ea', badgeText: null, headlineText: null })
})

test('buildStatusCopy: singular wording at one unit', () => {
  const status = buildStatusCopy({ progressState: computeProgressState(REDESIGN_TIERS_FIXED, 0, 1), tiers: REDESIGN_TIERS_FIXED, basePrice: REDESIGN_BASE, formatMoney: fmt })
  assert.equal(status.statusText, 'You have 1 unit')
  assert.equal(status.hintText, 'Add 7 for £1.63/ea')
})

test('buildStatusCopy: middle tier — "Offer unlocked", saving on the combined quantity, nudge to the highest discount', () => {
  const status = buildStatusCopy({ progressState: computeProgressState(REDESIGN_TIERS_FIXED, 0, 10), tiers: REDESIGN_TIERS_FIXED, basePrice: REDESIGN_BASE, formatMoney: fmt })
  assert.deepEqual(status, {
    state: 'offer',
    statusText: '10 units × £1.63 (Offer unlocked)',
    hintText: null,
    badgeText: 'Save £0.60',
    headlineText: 'Offer unlocked! Add 6 more to unlock the highest discount for £1.55',
  })
})

test('buildStatusCopy: a middle tier followed by another middle tier nudges to "the next offer"', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 8, fixedPrice: 1.63 }, { minQty: 16, fixedPrice: 1.55 }, { minQty: 32, fixedPrice: 1.45 }]
  const status = buildStatusCopy({ progressState: computeProgressState(tiers, 0, 10), tiers, basePrice: REDESIGN_BASE, formatMoney: fmt })
  assert.equal(status.headlineText, 'Offer unlocked! Add 6 more to unlock the next offer for £1.55')
})

test('buildStatusCopy: highest tier — "Highest discount unlocked" with the total saving, no "Tier" wording, no emoji', () => {
  const status = buildStatusCopy({ progressState: computeProgressState(REDESIGN_TIERS_FIXED, 0, 16), tiers: REDESIGN_TIERS_FIXED, basePrice: REDESIGN_BASE, formatMoney: fmt })
  assert.deepEqual(status, {
    state: 'highest',
    statusText: 'You have 16 units',
    hintText: '✓ Highest discount (£1.55/ea)',
    badgeText: null,
    headlineText: 'Highest discount unlocked: £1.55/each applied! (Save £2.24)',
  })
  assert.doesNotMatch(JSON.stringify(status), /Tier|🎉/)
})

test('buildStatusCopy: uses the real next tier (anchor pricing), not just its percent', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 4, anchorPrice: 5, percentOff: 0 }]
  const status = buildStatusCopy({ progressState: computeProgressState(tiers, 0, 1), tiers, basePrice: 2, formatMoney: fmt })
  assert.equal(status.hintText, 'Add 3 for £1.25/ea') // 5 / 4 units
})

test('computeWidgetViewModel: carries the redesign fields', () => {
  const vm = computeWidgetViewModel({ tiers: REDESIGN_TIERS_FIXED, basePrice: REDESIGN_BASE, otherQty: 4, addingQty: 1, isGroup: true, formatMoney: fmt })
  assert.equal(vm.offerState, 'progress')
  assert.equal(vm.dot.dotValue, 5)
  assert.equal(vm.promoLine, 'Mix and match 8+ for £1.63 or 16+ for £1.55')
  assert.equal(vm.status.hintText, 'Add 3 for £1.63/ea')
  assert.equal(vm.showCard, true)
})

test('computeWidgetViewModel: tier buttons show the unit price at each tier and dim the tiers below the applied one', () => {
  const vm = computeWidgetViewModel({ tiers: REDESIGN_TIERS_FIXED, basePrice: REDESIGN_BASE, otherQty: 0, addingQty: 10, isGroup: true, formatMoney: fmt })
  assert.deepEqual(vm.tierButtons, [
    { minQty: 1, active: false, dimmed: true, label: '1 × £1.69' },
    { minQty: 8, active: false, dimmed: false, label: '8 × £1.63' },
    { minQty: 16, active: false, dimmed: false, label: '16 × £1.55' },
  ])
  assert.equal(vm.tempBoxLabel, '10 × £1.63')
  assert.equal(vm.tempBoxAfterIndex, 1)
})

test('computeWidgetViewModel: at the exact tier the pill is active and the lower ones are dimmed; nothing is dimmed before the first offer', () => {
  const atTier = computeWidgetViewModel({ tiers: REDESIGN_TIERS_FIXED, basePrice: REDESIGN_BASE, otherQty: 0, addingQty: 16, isGroup: true, formatMoney: fmt })
  assert.deepEqual(atTier.tierButtons.map((b) => [b.active, b.dimmed]), [[false, true], [false, true], [true, false]])
  const before = computeWidgetViewModel({ tiers: REDESIGN_TIERS_FIXED, basePrice: REDESIGN_BASE, otherQty: 0, addingQty: 5, isGroup: true, formatMoney: fmt })
  assert.deepEqual(before.tierButtons.map((b) => b.dimmed), [false, false, false])
})

test('computeTierButtonsSignature: differs when only the cart quantity changed (same stepper value), so the temporary box is repainted', () => {
  const a = computeProgressState(REDESIGN_TIERS_FIXED, 2, 1)
  const b = computeProgressState(REDESIGN_TIERS_FIXED, 3, 1)
  assert.notEqual(computeTierButtonsSignature(a, 1.69, 1), computeTierButtonsSignature(b, 1.69, 1))
})

// Mix & match rows (redesign): thumbnail, name, price at the applied tier, quantity.

const ROW_PRODUCTS = [
  { title: 'Chicken & Salmon 85g', url: '/products/chicken-salmon', productId: 'gid://shopify/Product/1', imageUrl: 'https://example.com/s.png', price: 169, available: true, cartVariantId: '10' },
  { title: 'Chicken & Herring 85g', url: '/products/chicken-herring', productId: 'gid://shopify/Product/2', imageUrl: null, price: 169, available: false, cartVariantId: '20' },
]

test('formatItemsChosen: singular and plural', () => {
  assert.equal(formatItemsChosen(1), '1 item chosen')
  assert.equal(formatItemsChosen(16), '16 items chosen')
})

// Progress bar semantics (WCAG 4.1.2 / 4.1.3): role="progressbar" values and the spoken text.

test('buildProgressSemantics: below the first offer — value, range and where the next offer starts', () => {
  const state = computeProgressState(REDESIGN_TIERS_FIXED, 0, 5)
  assert.deepEqual(buildProgressSemantics(state), { valueNow: 5, valueMin: 1, valueMax: 16, valueText: '5 of 16 units. Next offer at 8.' })
})

test('buildProgressSemantics: a middle tier says the offer is unlocked and where the highest discount is', () => {
  const state = computeProgressState(REDESIGN_TIERS_FIXED, 0, 10)
  assert.equal(buildProgressSemantics(state).valueText, '10 of 16 units. Offer unlocked, highest discount at 16.')
})

test('buildProgressSemantics: the highest tier, and beyond it the value is clamped while the text keeps the real quantity', () => {
  assert.deepEqual(buildProgressSemantics(computeProgressState(REDESIGN_TIERS_FIXED, 0, 16)), { valueNow: 16, valueMin: 1, valueMax: 16, valueText: '16 of 16 units. Highest discount unlocked.' })
  assert.deepEqual(buildProgressSemantics(computeProgressState(REDESIGN_TIERS_FIXED, 0, 20)), { valueNow: 16, valueMin: 1, valueMax: 16, valueText: '20 units. Highest discount unlocked.' })
})

test('computeWidgetViewModel: carries the progress bar semantics', () => {
  const vm = computeWidgetViewModel({ tiers: REDESIGN_TIERS_FIXED, basePrice: REDESIGN_BASE, otherQty: 0, addingQty: 10, isGroup: true, formatMoney: fmt })
  assert.equal(vm.semantics.valueNow, 10)
})

// Themes such as Dawn set the root font size to 62.5%, so 1rem is 10px there.

test('the tier stylesheet sizes its text in px, never rem, and caps the price at 36px', () => {
  const fs = require('node:fs')
  const path = require('node:path')
  const style = fs.readFileSync(path.join(__dirname, '../product-tier-pricing/assets/tier-pricing.css'), 'utf8')
  const remSizes = style.match(/font-size:\s*[\d.]+rem/g) || []
  assert.deepEqual(remSizes, [])
  assert.match(style, /font-size:\s*min\(var\(--sparkly-tier-price-font-size, 32px\), 36px\)/)
  assert.match(style, /@media \(max-width: 749px\)[^}]*\{[^}]*font-size:\s*min\(var\(--sparkly-tier-price-font-size, 32px\), 28px\)/)
})

// Rows: the number in the cart, and an Add link to the product unless it is the one on the page or sold out.

const ROW_CART = [{ product_id: 1, variant_id: 10, quantity: 6 }, { product_id: 3, variant_id: 30, quantity: 2 }]

function rowsFor(overrides) {
  const state = computeProgressState(REDESIGN_TIERS_FIXED, 0, 10)
  const pricing = { combinedQty: state.combinedQty, tierState: state.tierState, formatMoney: fmt }
  return buildMixMatchRows({ products: ROW_PRODUCTS, cartItems: ROW_CART, pricing, currentVariantId: null, ...overrides })
}

test('buildMixMatchRows: a row shows what is in the cart', () => {
  assert.deepEqual(rowsFor({}).map((row) => row.qty), [6, 0])
})

test('buildMixMatchRows: carries the link, name, image, tier price and availability', () => {
  const [salmon, herring] = rowsFor({})
  assert.deepEqual(
    [salmon.href, salmon.title, salmon.imageUrl, salmon.priceLabel, salmon.available],
    ['/products/chicken-salmon', 'Chicken & Salmon 85g', 'https://example.com/s.png', '£1.63', true],
  )
  assert.deepEqual([herring.imageUrl, herring.available], [null, false])
})

test('buildMixMatchRows: an available row gets an Add link, a sold-out row does not', () => {
  assert.deepEqual(rowsFor({}).map((row) => row.showAdd), [true, false])
})

test('buildMixMatchRows: the row of the variant on the page has no Add link, the in-cart number stays', () => {
  const rows = rowsFor({ currentVariantId: '10' })
  assert.deepEqual([rows[0].showAdd, rows[0].qty], [false, 6])
})

test('buildMixMatchRows: before any offer applies a row shows its own full price; without pricing context the label is empty', () => {
  const state = computeProgressState(REDESIGN_TIERS_FIXED, 0, 5)
  const before = rowsFor({ pricing: { combinedQty: 5, tierState: state.tierState, formatMoney: fmt } })
  assert.equal(before[0].priceLabel, '£1.69')
  assert.equal(rowsFor({ pricing: null })[0].priceLabel, '')
})

test('buildMixMatchRows: a row with no price gets an empty label, availability defaults to available, a product with several variants still gets an Add link', () => {
  const rows = buildMixMatchRows({ products: [{ title: 'X', url: '/products/x', productId: 'gid://shopify/Product/9', imageUrl: null }], cartItems: [], pricing: { combinedQty: 1, tierState: computeProgressState(REDESIGN_TIERS_FIXED, 0, 1).tierState, formatMoney: fmt }, currentVariantId: null })
  assert.deepEqual([rows[0].priceLabel, rows[0].available, rows[0].showAdd], ['', true, true])
})

test('buildMixMatchRows: a variant-scoped member matches only that exact variant\'s cart quantity', () => {
  const rows = buildMixMatchRows({
    products: [{ title: 'X', url: '/products/x?variant=90', productId: 'gid://shopify/Product/9', variantId: 'gid://shopify/ProductVariant/90', imageUrl: null }],
    cartItems: [{ product_id: 9, variant_id: 90, quantity: 3 }, { product_id: 9, variant_id: 91, quantity: 4 }],
    pricing: null, currentVariantId: null,
  })
  assert.equal(rows[0].qty, 3)
})
