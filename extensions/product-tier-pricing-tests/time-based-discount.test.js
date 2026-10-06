const test = require('node:test')
const assert = require('node:assert/strict')
const {
  computeCountdown,
  formatCountdownUnit,
  paintCountdown,
  computeDiscountedPriceCents,
  countdownDiscountItems,
  countdownDiscountItemFor,
  discountReducesPrice,
  timeDiscountNumericId
} = require('../product-tier-pricing/assets/time-based-discount.js')

test('computeCountdown: inactive before the window starts', () => {
  const result = computeCountdown('2026-06-01T00:00:00', '2026-06-02T00:00:00', new Date('2026-05-31T23:59:59'))
  assert.equal(result.active, false)
})

test('computeCountdown: inactive at or after the window ends', () => {
  const atEnd = computeCountdown('2026-06-01T00:00:00', '2026-06-02T00:00:00', new Date('2026-06-02T00:00:00'))
  assert.equal(atEnd.active, false)
  const pastEnd = computeCountdown('2026-06-01T00:00:00', '2026-06-02T00:00:00', new Date('2026-06-02T00:00:01'))
  assert.equal(pastEnd.active, false)
})

test('computeCountdown: active exactly at the start, full window remaining', () => {
  const result = computeCountdown('2026-06-01T00:00:00', '2026-06-02T00:00:00', new Date('2026-06-01T00:00:00'))
  assert.equal(result.active, true)
  assert.equal(result.days, 1)
  assert.equal(result.hours, 0)
  assert.equal(result.minutes, 0)
  assert.equal(result.seconds, 0)
})

test('computeCountdown: splits remaining time into days/hours/minutes/seconds', () => {
  // 1 day, 12 hours, 23 minutes, 57 seconds remaining
  const result = computeCountdown('2026-06-01T00:00:00', '2026-06-03T12:23:57', new Date('2026-06-02T00:00:00'))
  assert.equal(result.active, true)
  assert.equal(result.days, 1)
  assert.equal(result.hours, 12)
  assert.equal(result.minutes, 23)
  assert.equal(result.seconds, 57)
})

test('computeCountdown: just under one minute remaining rounds down to 0 minutes, correct seconds', () => {
  const result = computeCountdown('2026-06-01T00:00:00', '2026-06-01T00:00:59', new Date('2026-06-01T00:00:00'))
  assert.equal(result.active, true)
  assert.equal(result.days, 0)
  assert.equal(result.hours, 0)
  assert.equal(result.minutes, 0)
  assert.equal(result.seconds, 59)
})

test('computeCountdown: treats a real UTC ISO instant as the same absolute moment regardless of process timezone — the guarantee the metafield-sync fix depends on', () => {
  // startsAt/endsAt here are real UTC instants (with the Z suffix), as
  // written by syncTimeDiscountMetafields after converting the naive
  // shop-local strings via zonedTimeToUtc. new Date(...) parses a 'Z'
  // string as an absolute instant in every timezone, so this must behave
  // identically no matter what timezone the test runner itself is in.
  const result = computeCountdown('2026-06-01T00:00:00.000Z', '2026-06-02T00:00:00.000Z', new Date('2026-06-01T12:00:00.000Z'))
  assert.equal(result.active, true)
  assert.equal(result.days, 0)
  assert.equal(result.hours, 12)
  assert.equal(result.minutes, 0)
  assert.equal(result.seconds, 0)
})

test('formatCountdownUnit: zero-pads single digits', () => {
  assert.equal(formatCountdownUnit(0), '00')
  assert.equal(formatCountdownUnit(5), '05')
  assert.equal(formatCountdownUnit(23), '23')
})

// Prices: minor units (pence), because that is what Shopify's variant.price and
// the money format use. A £20.00 variant is 2000.

test('computeDiscountedPriceCents: percent mode takes the percentage off the variant price', () => {
  assert.equal(computeDiscountedPriceCents(2000, 'percent', 20), 1600)
  assert.equal(computeDiscountedPriceCents(4999, 'percent', 10), 4499) // 4499.1 rounds to pence
})

test('computeDiscountedPriceCents: fixed mode IS the final price in major units, whatever the variant price is', () => {
  assert.equal(computeDiscountedPriceCents(4999, 'fixed', 22), 2200)
  assert.equal(computeDiscountedPriceCents(100000, 'fixed', 22.5), 2250)
})

test('computeDiscountedPriceCents: percent is clamped to 0-100 so the price never goes negative', () => {
  assert.equal(computeDiscountedPriceCents(2000, 'percent', 150), 0)
  assert.equal(computeDiscountedPriceCents(2000, 'percent', -10), 2000)
})

const CV10 = 'gid://shopify/ProductVariant/10'

test('countdownDiscountItems: current metafields carry rows; an older single-rule metafield becomes rows; no pricing means no rows', () => {
  const items = [{ variantId: CV10, pricingMode: 'fixed', amount: 22 }]
  assert.deepEqual(countdownDiscountItems({ items }), items)
  assert.deepEqual(countdownDiscountItems({ pricingMode: 'percent', amount: 20, variantIds: null }), [{ variantId: null, pricingMode: 'percent', amount: 20 }])
  assert.deepEqual(countdownDiscountItems({ pricingMode: 'fixed', amount: 22, variantIds: [CV10] }), [{ variantId: CV10, pricingMode: 'fixed', amount: 22 }])
  assert.deepEqual(countdownDiscountItems({ pricingMode: null, amount: null, variantIds: null }), [])
})

test('countdownDiscountItemFor: the variant\'s own row wins over the whole-product row', () => {
  const whole = { variantId: null, pricingMode: 'percent', amount: 10 }
  const own = { variantId: CV10, pricingMode: 'fixed', amount: 5 }
  assert.equal(countdownDiscountItemFor([whole, own], '10'), own)
  assert.equal(countdownDiscountItemFor([whole, own], 10), own)
  assert.equal(countdownDiscountItemFor([whole, own], '11'), whole)
  assert.equal(countdownDiscountItemFor([own], '11'), null)
})

test('discountReducesPrice: true for a variant with a row and a real saving (fixed price is the final price)', () => {
  const fixed = { items: [{ variantId: null, pricingMode: 'fixed', amount: 22 }] }
  const percent = { items: [{ variantId: null, pricingMode: 'percent', amount: 20 }] }
  assert.equal(discountReducesPrice({ priceCents: 4999, discount: fixed, variantId: '1' }), true)
  assert.equal(discountReducesPrice({ priceCents: 4999, discount: percent, variantId: '1' }), true)
})

test('discountReducesPrice: false for a variant with no row', () => {
  const discount = { items: [{ variantId: CV10, pricingMode: 'percent', amount: 20 }] }
  assert.equal(discountReducesPrice({ priceCents: 4999, discount, variantId: '12' }), false)
})

test('discountReducesPrice: each variant is judged by its own row', () => {
  const discount = { items: [{ variantId: CV10, pricingMode: 'fixed', amount: 25 }, { variantId: 'gid://shopify/ProductVariant/11', pricingMode: 'fixed', amount: 5 }] }
  assert.equal(discountReducesPrice({ priceCents: 2000, discount, variantId: '10' }), false) // £25 is not below £20
  assert.equal(discountReducesPrice({ priceCents: 2000, discount, variantId: '11' }), true)
})

test('discountReducesPrice: false when a fixed price is not below the variant price (checkout applies no discount then)', () => {
  const fixed = (amount) => ({ items: [{ variantId: null, pricingMode: 'fixed', amount }] })
  assert.equal(discountReducesPrice({ priceCents: 2000, discount: fixed(25), variantId: '1' }), false)
  assert.equal(discountReducesPrice({ priceCents: 2000, discount: fixed(20), variantId: '1' }), false)
})

test('discountReducesPrice: false for a 0% discount', () => {
  assert.equal(discountReducesPrice({ priceCents: 2000, discount: { items: [{ variantId: null, pricingMode: 'percent', amount: 0 }] }, variantId: '1' }), false)
})

test('timeDiscountNumericId: takes the trailing id of a GID and leaves numeric ids alone', () => {
  assert.equal(timeDiscountNumericId('gid://shopify/ProductVariant/42'), '42')
  assert.equal(timeDiscountNumericId(42), '42')
})

test('paintCountdown: hidden when the window is not active', () => {
  assert.deepEqual(paintCountdown({ active: false, days: 0, hours: 0, minutes: 0, seconds: 0 }), { hidden: true })
})

test('paintCountdown: hidden when active but no sale applies to the selected variant', () => {
  assert.deepEqual(paintCountdown({ active: true, days: 1, hours: 2, minutes: 3, seconds: 4, applies: false }), { hidden: true })
})

test('paintCountdown: shows the countdown when a sale applies, with the discount title', () => {
  const state = paintCountdown({ active: true, days: 1, hours: 2, minutes: 3, seconds: 4, title: 'Summer Sale', applies: true })
  assert.deepEqual(state, { hidden: false, label: 'Summer Sale ends in:', days: '01', hours: '02', minutes: '03', seconds: '04' })
})

test('paintCountdown: shows the countdown alone when there is no pricing data (older metafield)', () => {
  const state = paintCountdown({ active: true, days: 0, hours: 0, minutes: 0, seconds: 37, applies: null })
  assert.equal(state.hidden, false)
  assert.equal(state.label, 'Sale ends in:')
  assert.equal(state.seconds, '37')
})
