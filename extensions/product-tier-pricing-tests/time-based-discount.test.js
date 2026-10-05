const test = require('node:test')
const assert = require('node:assert/strict')
const {
  computeCountdown,
  formatCountdownUnit,
  paintCountdown,
  computeDiscountedPriceCents,
  isVariantCovered,
  computePriceDisplay,
  formatTimeDiscountMoney,
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

test('isVariantCovered: null or empty list covers every variant; otherwise only the listed ones (GIDs vs numeric ids)', () => {
  assert.equal(isVariantCovered(null, '10'), true)
  assert.equal(isVariantCovered([], '10'), true)
  const ids = ['gid://shopify/ProductVariant/10', 'gid://shopify/ProductVariant/11']
  assert.equal(isVariantCovered(ids, '10'), true)
  assert.equal(isVariantCovered(ids, 11), true)
  assert.equal(isVariantCovered(ids, '12'), false)
})

test('computePriceDisplay: shows original and discounted price for a covered variant with a real saving', () => {
  const result = computePriceDisplay({ priceCents: 4999, pricingMode: 'fixed', amount: 22, variantIds: null, variantId: '1' })
  assert.deepEqual(result, { show: true, originalCents: 4999, discountedCents: 2200 })
})

test('computePriceDisplay: hidden for a variant the discount does not cover', () => {
  const result = computePriceDisplay({
    priceCents: 4999, pricingMode: 'percent', amount: 20,
    variantIds: ['gid://shopify/ProductVariant/10'], variantId: '12'
  })
  assert.equal(result.show, false)
})

test('computePriceDisplay: hidden when a fixed price is not below the variant price (checkout applies no discount then)', () => {
  assert.equal(computePriceDisplay({ priceCents: 2000, pricingMode: 'fixed', amount: 25, variantIds: null, variantId: '1' }).show, false)
  assert.equal(computePriceDisplay({ priceCents: 2000, pricingMode: 'fixed', amount: 20, variantIds: null, variantId: '1' }).show, false)
})

test('computePriceDisplay: hidden for a 0% discount', () => {
  assert.equal(computePriceDisplay({ priceCents: 2000, pricingMode: 'percent', amount: 0, variantIds: null, variantId: '1' }).show, false)
})

test('formatTimeDiscountMoney: converts pence to the shop money format', () => {
  assert.equal(formatTimeDiscountMoney(2200, '£{{amount}}'), '£22.00')
  assert.equal(formatTimeDiscountMoney(4999, '£{{ amount }}'), '£49.99')
  assert.equal(formatTimeDiscountMoney(5, '${{amount}} USD'), '$0.05 USD')
})

test('timeDiscountNumericId: takes the trailing id of a GID and leaves numeric ids alone', () => {
  assert.equal(timeDiscountNumericId('gid://shopify/ProductVariant/42'), '42')
  assert.equal(timeDiscountNumericId(42), '42')
})

test('paintCountdown: hidden when the window is not active', () => {
  assert.deepEqual(paintCountdown({ active: false, days: 0, hours: 0, minutes: 0, seconds: 0 }), { hidden: true })
})

test('paintCountdown: hidden when active but the price display says there is no real sale', () => {
  const state = paintCountdown({ active: true, days: 1, hours: 2, minutes: 3, seconds: 4, price: { show: false } })
  assert.deepEqual(state, { hidden: true })
})

test('paintCountdown: shows the countdown alone when there is no price data (older metafield)', () => {
  const state = paintCountdown({ active: true, days: 1, hours: 2, minutes: 3, seconds: 4, title: 'Summer Sale', price: null })
  assert.equal(state.hidden, false)
  assert.equal(state.label, 'Summer Sale ends in:')
  assert.equal(state.days, '01')
  assert.equal(state.price, null)
})

test('paintCountdown: passes the price through when active and the sale is real', () => {
  const price = { show: true, discountedText: '£22.00', originalText: '£49.99' }
  const state = paintCountdown({ active: true, days: 0, hours: 0, minutes: 0, seconds: 37, price })
  assert.equal(state.hidden, false)
  assert.equal(state.label, 'Sale ends in:')
  assert.deepEqual(state.price, price)
})
