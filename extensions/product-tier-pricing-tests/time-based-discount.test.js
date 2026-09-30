const test = require('node:test')
const assert = require('node:assert/strict')
const { computeCountdown, formatCountdownUnit } = require('../product-tier-pricing/assets/time-based-discount.js')

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
