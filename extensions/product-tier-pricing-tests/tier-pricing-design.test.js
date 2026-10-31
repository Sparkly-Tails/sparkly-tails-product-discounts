// The Stitch widget design: chips with totals, the price tag / tier pill, and the status copy.
const test = require('node:test')
const assert = require('node:assert/strict')
const { buildTierChips, buildPriceTag, buildStatusCopy, computeProgressState, computeWidgetViewModel, totalAtQuantity, computeTierState } = require('../product-tier-pricing/src/widgetFunctions.js')

const fmt = (n) => '£' + n.toFixed(2)
// The design's worked example: base £1.69; 8 units for £13.00 and 16 for £24.80, extra units at the tier's percent.
const ANCHOR_TIERS = [{ minQty: 1, percentOff: 0 }, { minQty: 8, percentOff: 3.5503, anchorPrice: 13 }, { minQty: 16, percentOff: 8.284, anchorPrice: 24.8 }]
const FIXED_TIERS = [{ minQty: 1, percentOff: 0 }, { minQty: 8, fixedPrice: 1.63 }, { minQty: 16, fixedPrice: 1.55 }]
const BASE = 1.69

const chipsFor = (tiers, qty) => buildTierChips({ tiers, basePrice: BASE, combinedQty: qty, formatMoney: fmt })

test('totalAtQuantity: the price of the whole quantity at what the tier gives, rounded to pence', () => {
  assert.equal(totalAtQuantity(BASE, 8, computeTierState(ANCHOR_TIERS, 8)), 13)
  assert.equal(totalAtQuantity(BASE, 22, computeTierState(ANCHOR_TIERS, 22)), 34.1)
  assert.equal(totalAtQuantity(BASE, 5, computeTierState(ANCHOR_TIERS, 5)), 8.45)
})

test('buildTierChips: between the start and the first offer a dashed current chip sits after the start chip', () => {
  assert.deepEqual(chipsFor(ANCHOR_TIERS, 5), [
    { kind: 'tier', qty: 1, label: '1 × £1.69', tone: 'idle' },
    { kind: 'current', qty: 5, label: '5 × £8.45', tone: 'progress' },
    { kind: 'tier', qty: 8, label: '8 × £13.00', tone: 'idle' },
    { kind: 'tier', qty: 16, label: '16 × £24.80', tone: 'idle' },
  ])
})

test('buildTierChips: a middle tier is applied (tick) and the current chip follows it', () => {
  assert.deepEqual(chipsFor(ANCHOR_TIERS, 10), [
    { kind: 'tier', qty: 1, label: '1 × £1.69', tone: 'idle' },
    { kind: 'tier', qty: 8, label: '8 × £13.00 ✓', tone: 'applied' },
    { kind: 'current', qty: 10, label: '10 × £16.26', tone: 'offer' },
    { kind: 'tier', qty: 16, label: '16 × £24.80', tone: 'idle' },
  ])
})

test('buildTierChips: past the top tier the top chip is applied and the current chip has a star', () => {
  assert.deepEqual(chipsFor(ANCHOR_TIERS, 22), [
    { kind: 'tier', qty: 1, label: '1 × £1.69', tone: 'idle' },
    { kind: 'tier', qty: 8, label: '8 × £13.00', tone: 'idle' },
    { kind: 'tier', qty: 16, label: '16 × £24.80 ✓', tone: 'applied' },
    { kind: 'current', qty: 22, label: '22 × £34.10 ★', tone: 'highest' },
  ])
})

test('buildTierChips: exactly on a tier there is no current chip; on the start (no offer yet) the start chip is the exact one', () => {
  const onTier = chipsFor(ANCHOR_TIERS, 8)
  assert.deepEqual(onTier.map((chip) => [chip.kind, chip.tone]), [['tier', 'idle'], ['tier', 'applied'], ['tier', 'idle']])
  const onStart = chipsFor(ANCHOR_TIERS, 1)
  assert.deepEqual(onStart.map((chip) => [chip.kind, chip.tone]), [['tier', 'exact'], ['tier', 'idle'], ['tier', 'idle']])
})

test('buildTierChips: fixed-price tiers show the fixed price times the quantity', () => {
  assert.deepEqual(chipsFor(FIXED_TIERS, 10).map((chip) => chip.label), ['1 × £1.69', '8 × £13.04 ✓', '10 × £16.30', '16 × £24.80'])
})

test('buildTierChips: a single real tier works the same way', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 8, fixedPrice: 1.63 }]
  assert.deepEqual(chipsFor(tiers, 12).map((chip) => [chip.label, chip.tone]), [['1 × £1.69', 'idle'], ['8 × £13.04 ✓', 'applied'], ['12 × £19.56 ★', 'highest']])
})

test('buildPriceTag: before any offer the High Demand tag shows only when it is switched on', () => {
  const state = computeProgressState(ANCHOR_TIERS, 4, 1)
  assert.deepEqual(buildPriceTag({ progressState: state, tiers: ANCHOR_TIERS, highDemand: true }), { kind: 'high-demand', text: 'High Demand' })
  assert.equal(buildPriceTag({ progressState: state, tiers: ANCHOR_TIERS, highDemand: false }), null)
})

test('buildPriceTag: a middle tier reads "Tier N Active (Q+ units)", the top one "(Q+ • Unlimited)", whatever High Demand says', () => {
  assert.deepEqual(buildPriceTag({ progressState: computeProgressState(ANCHOR_TIERS, 0, 10), tiers: ANCHOR_TIERS, highDemand: true }), { kind: 'tier', text: 'Tier 1 Active (8+ units)' })
  assert.equal(buildPriceTag({ progressState: computeProgressState(ANCHOR_TIERS, 0, 16), tiers: ANCHOR_TIERS, highDemand: false }).text, 'Tier 2 Active (16+ • Unlimited)')
  assert.equal(buildPriceTag({ progressState: computeProgressState(ANCHOR_TIERS, 0, 22), tiers: ANCHOR_TIERS, highDemand: false }).text, 'Tier 2 Active (16+ • Unlimited)')
})

test('buildPriceTag: a single real tier is Tier 1 and unlimited; three real tiers number the middle one 2', () => {
  const single = [{ minQty: 1, percentOff: 0 }, { minQty: 8, fixedPrice: 1.63 }]
  assert.equal(buildPriceTag({ progressState: computeProgressState(single, 0, 9), tiers: single, highDemand: false }).text, 'Tier 1 Active (8+ • Unlimited)')
  const three = [{ minQty: 1, percentOff: 0 }, { minQty: 8, fixedPrice: 1.63 }, { minQty: 16, fixedPrice: 1.55 }, { minQty: 32, fixedPrice: 1.45 }]
  assert.equal(buildPriceTag({ progressState: computeProgressState(three, 0, 20), tiers: three, highDemand: false }).text, 'Tier 2 Active (16+ units)')
})

test('buildPriceTag: when the admin configured a real tier at 1 unit it is Tier 1 (no hidden start tier to skip)', () => {
  const tiers = [{ minQty: 1, percentOff: 5 }, { minQty: 8, percentOff: 10 }]
  assert.equal(buildPriceTag({ progressState: computeProgressState(tiers, 0, 1), tiers, highDemand: false }).text, 'Tier 1 Active (1+ units)')
  assert.equal(buildPriceTag({ progressState: computeProgressState(tiers, 0, 8), tiers, highDemand: false }).text, 'Tier 2 Active (8+ • Unlimited)')
})

const statusFor = (qty, tiers = FIXED_TIERS) => buildStatusCopy({ progressState: computeProgressState(tiers, 0, qty), tiers, basePrice: BASE, formatMoney: fmt })

test('buildStatusCopy: below the first offer — units owned in bold, a hint to the next price', () => {
  assert.deepEqual(statusFor(5), {
    state: 'progress', statusText: 'You have 5 units', statusParts: { before: 'You have ', strong: '5 units', after: '' },
    hintText: 'Add 3 for £1.63/ea', hintTone: 'accent',
  })
})

test('buildStatusCopy: singular wording at one unit', () => {
  const status = statusFor(1)
  assert.deepEqual([status.statusText, status.hintText], ['You have 1 unit', 'Add 7 for £1.63/ea'])
})

test('buildStatusCopy: a middle tier keeps the same sentence and nudges to the next price', () => {
  assert.deepEqual(statusFor(10), {
    state: 'offer', statusText: 'You have 10 units', statusParts: { before: 'You have ', strong: '10 units', after: '' },
    hintText: 'Add 6 for £1.55/ea', hintTone: 'olive',
  })
})

test('buildStatusCopy: the top tier says Best Rate; beyond it the sentence says the quantity exceeds the tier', () => {
  assert.deepEqual(statusFor(16), {
    state: 'highest', statusText: 'You have 16 units', statusParts: { before: 'You have ', strong: '16 units', after: '' },
    hintText: 'Best Rate (£1.55/ea • Add any qty)', hintTone: 'success',
  })
  const beyond = statusFor(22)
  assert.deepEqual([beyond.statusText, beyond.statusParts.after], ['You have 22 units (Exceeds 16+ tier)', ' (Exceeds 16+ tier)'])
})

test('buildStatusCopy: the next price comes from the real tier (anchor pricing), not just its percent', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 4, anchorPrice: 5, percentOff: 0 }]
  const status = buildStatusCopy({ progressState: computeProgressState(tiers, 0, 1), tiers, basePrice: 2, formatMoney: fmt })
  assert.equal(status.hintText, 'Add 3 for £1.25/ea')
})

test('computeWidgetViewModel carries the chips, the tag and the status of the design', () => {
  const vm = computeWidgetViewModel({ tiers: ANCHOR_TIERS, basePrice: BASE, otherQty: 9, addingQty: 1, isGroup: true, highDemand: true, formatMoney: fmt })
  assert.deepEqual(vm.chips.map((chip) => chip.label), ['1 × £1.69', '8 × £13.00 ✓', '10 × £16.26', '16 × £24.80'])
  assert.deepEqual(vm.tag, { kind: 'tier', text: 'Tier 1 Active (8+ units)' })
  assert.equal(vm.status.hintText, 'Add 6 for £1.55/ea')
  assert.equal(vm.promoLine, 'Mix and match 8+ for £1.63 or 16+ for £1.55')
})

test('computeWidgetViewModel: the promo line stays when an offer applies (the design keeps it in every state)', () => {
  const vm = computeWidgetViewModel({ tiers: ANCHOR_TIERS, basePrice: BASE, otherQty: 21, addingQty: 1, isGroup: true, highDemand: false, formatMoney: fmt })
  assert.equal(vm.promoLine, 'Mix and match 8+ for £1.63 or 16+ for £1.55')
  assert.equal(vm.status.statusText, 'You have 22 units (Exceeds 16+ tier)')
})
