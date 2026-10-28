// The flash sale bar, teaser and countdown of the tier widget (pure functions).
const test = require('node:test')
const assert = require('node:assert/strict')
const { flashPhase, flashCountdownParts, formatFlashCountdown, formatFlashChip, buildFlashBar, computeWidgetViewModel } = require('../product-tier-pricing/assets/tier-pricing.js')

const fmt = (n) => '£' + n.toFixed(2)
const START = 1_800_000_000
const END = START + 3 * 86400

test('flashPhase: before the start second it is before; from the start second it is running', () => {
  assert.equal(flashPhase({ nowSeconds: START - 1, startsAtUnix: START, endsAtUnix: END }), 'before')
  assert.equal(flashPhase({ nowSeconds: START, startsAtUnix: START, endsAtUnix: END }), 'running')
})

test('flashPhase: the last running second is one before the end second; from the end second it is ended', () => {
  assert.equal(flashPhase({ nowSeconds: END - 1, startsAtUnix: START, endsAtUnix: END }), 'running')
  assert.equal(flashPhase({ nowSeconds: END, startsAtUnix: START, endsAtUnix: END }), 'ended')
  assert.equal(flashPhase({ nowSeconds: END + 99999, startsAtUnix: START, endsAtUnix: END }), 'ended')
})

test('flashCountdownParts and formatFlashCountdown: hours only while an hour or more is left', () => {
  assert.deepEqual(flashCountdownParts({ secondsLeft: 4 * 3600 + 18 * 60 + 49 }), ['04', '18', '49'])
  assert.equal(formatFlashCountdown({ secondsLeft: 2 * 3600 + 10 * 60 }), '02 : 10 : 00')
  assert.equal(formatFlashCountdown({ secondsLeft: 3600 }), '01 : 00 : 00')
  assert.equal(formatFlashCountdown({ secondsLeft: 3599 }), '59 : 59')
  assert.equal(formatFlashCountdown({ secondsLeft: 14 * 60 + 32 }), '14 : 32')
  assert.equal(formatFlashCountdown({ secondsLeft: 5 }), '00 : 05')
})

test('formatFlashCountdown: never negative, and hours above 99 keep every digit', () => {
  assert.equal(formatFlashCountdown({ secondsLeft: 0 }), '00 : 00')
  assert.equal(formatFlashCountdown({ secondsLeft: -40 }), '00 : 00')
  assert.equal(formatFlashCountdown({ secondsLeft: 100 * 3600 }), '100 : 00 : 00')
})

test('formatFlashChip: the compact timer of the chip', () => {
  assert.equal(formatFlashChip({ secondsLeft: 14 * 60 + 32 }), '14:32')
  assert.equal(formatFlashChip({ secondsLeft: 3600 + 5 }), '1:00:05')
  assert.equal(formatFlashChip({ secondsLeft: -1 }), '00:00')
})

const bar = (over) => buildFlashBar({ phase: 'running', showTeaser: true, reachedTier: 0, unitPriceLabel: '£1.63', countdownText: '04 : 18 : 49', countdownParts: ['04', '18', '49'], chipText: '14:32', ...over })

test('buildFlashBar: the teaser before the start counts down to the start', () => {
  assert.deepEqual(bar({ phase: 'before', countdownText: '02 : 10 : 00', countdownParts: ['02', '10', '00'] }), {
    variant: 'teaser', text: 'Flash sale starts in 02 : 10 : 00', label: 'Flash sale starts in', timerParts: ['02', '10', '00'], aside: '', chip: '',
  })
})

test('buildFlashBar: before the start with the teaser off, and after the end, there is no bar', () => {
  const hidden = { variant: 'hidden', text: '', label: '', timerParts: [], aside: '', chip: '' }
  assert.deepEqual(bar({ phase: 'before', showTeaser: false }), hidden)
  assert.deepEqual(bar({ phase: 'ended' }), hidden)
  assert.deepEqual(bar({ phase: 'ended', showTeaser: false }), hidden)
})

test('buildFlashBar: running below the first tier says when the sale ends', () => {
  assert.deepEqual(bar({ reachedTier: 0 }), {
    variant: 'ends', text: 'Flash sale ends in 04 : 18 : 49', label: 'Flash sale ends in', timerParts: ['04', '18', '49'], aside: '', chip: '',
  })
})

test('buildFlashBar: the first tier shows the unit price on the right and the timer chip', () => {
  assert.deepEqual(bar({ reachedTier: 1 }), {
    variant: 'tier-first', text: 'Tier 1 unlocked! Flash sale active', label: 'Tier 1 unlocked! Flash sale active', timerParts: [], aside: '£1.63/ea', chip: '14:32',
  })
})

test('buildFlashBar: a higher tier names the tier and the unit price and keeps the timer chip', () => {
  assert.deepEqual(bar({ reachedTier: 2, unitPriceLabel: '£1.55' }), {
    variant: 'tier-higher', text: 'Tier 2 active (£1.55/ea · Keep adding)', label: 'Tier 2 active (£1.55/ea · Keep adding)', timerParts: [], aside: '', chip: '14:32',
  })
  assert.equal(bar({ reachedTier: 3, unitPriceLabel: '£1.45' }).text, 'Tier 3 active (£1.45/ea · Keep adding)')
})

const TIERS = [{ minQty: 1, percentOff: 0 }, { minQty: 8, fixedPrice: 1.63 }, { minQty: 16, fixedPrice: 1.55 }]
const flashVm = (over) => computeWidgetViewModel({
  tiers: TIERS, basePrice: 1.69, otherQty: 0, addingQty: 1, isGroup: true, highDemand: false,
  flash: { startsAtUnix: START, endsAtUnix: END, showTeaser: true }, nowSeconds: START + 100, formatMoney: fmt, ...over,
})

test('computeWidgetViewModel: a non-flash discount has no bar and always shows its widget', () => {
  const vm = computeWidgetViewModel({ tiers: TIERS, basePrice: 1.69, otherQty: 0, addingQty: 1, isGroup: true, formatMoney: fmt })
  assert.equal(vm.flashBar, null)
  assert.equal(vm.showChrome, true)
  assert.equal(vm.showCard, true)
})

test('computeWidgetViewModel: running, the bar follows the reached tier and the widget is complete', () => {
  assert.equal(flashVm({ addingQty: 1 }).flashBar.variant, 'ends')
  assert.equal(flashVm({ addingQty: 8 }).flashBar.variant, 'tier-first')
  const higher = flashVm({ addingQty: 16 })
  assert.deepEqual([higher.flashBar.variant, higher.flashBar.text], ['tier-higher', 'Tier 2 active (£1.55/ea · Keep adding)'])
  assert.equal(higher.showCard, true)
})

test('computeWidgetViewModel: the countdown and the chip count what is left to the end second', () => {
  const vm = flashVm({ nowSeconds: END - (4 * 3600 + 18 * 60 + 49) })
  assert.equal(vm.flashBar.text, 'Flash sale ends in 04 : 18 : 49')
  const chip = flashVm({ addingQty: 8, nowSeconds: END - (14 * 60 + 32) })
  assert.equal(chip.flashBar.chip, '14:32')
})

test('computeWidgetViewModel: the teaser shows the bar, the plain price and the progress bar, but no tier prices', () => {
  const vm = flashVm({ nowSeconds: START - (2 * 3600 + 10 * 60), addingQty: 9 })
  assert.equal(vm.flashBar.text, 'Flash sale starts in 02 : 10 : 00')
  // no discount, tag, promo line, chips or drawer: they all carry tier prices
  assert.deepEqual([vm.showChrome, vm.discountedPrice, vm.plainPrice, vm.tag, vm.chips, vm.showChips, vm.showDrawer], [true, null, '£1.69', null, [], false, false])
  // the progress bar is there: the quantity, the pins at the tier quantities, and no offer state
  assert.deepEqual([vm.showCard, vm.offerState, vm.dot.dotValue, vm.dot.markers.map((m) => m.value)], [true, 'progress', 9, [1, 8, 16]])
  assert.deepEqual(vm.status, {
    state: 'progress', statusText: 'You have 9 units', statusParts: { before: 'You have ', strong: '9 units', after: '' },
    hintText: 'Tier prices start with the sale', hintTone: 'accent',
  })
  assert.equal(vm.semantics.valueText, '9 of 16 units. Tier prices start with the sale.')
})

test('computeWidgetViewModel: the teaser says the price now and the price from the start for the selected quantity', () => {
  const vm = flashVm({ nowSeconds: START - 600, addingQty: 9 })
  // 9 units reach the 8+ tier: £1.63 each once the sale starts
  assert.deepEqual([vm.priceLabel, vm.plainPrice, vm.promoLine], ['It is now:', '£1.69', 'Get it from: £1.63'])
})

test('computeWidgetViewModel: the "from" price follows the quantity (page plus cart) through the tiers', () => {
  const from = (quantity, over = {}) => flashVm({ nowSeconds: START - 600, addingQty: quantity, ...over }).promoLine
  assert.deepEqual([1, 7, 8, 15, 16, 22].map((quantity) => from(quantity)), [
    'Get it from: £1.69', 'Get it from: £1.69', 'Get it from: £1.63', 'Get it from: £1.63', 'Get it from: £1.55', 'Get it from: £1.55',
  ])
  assert.equal(from(1, { otherQty: 8 }), 'Get it from: £1.63') // 8 in the cart already, 1 on the page: 9 units
})

test('computeWidgetViewModel: an anchor tier prices the whole quantity (the total divided by the units)', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 2, percentOff: 5, anchorPrice: 6 }, { minQty: 4, percentOff: 10, anchorPrice: 5 }]
  const from = (quantity) => computeWidgetViewModel({
    tiers, basePrice: 7.3, otherQty: 0, addingQty: quantity, isGroup: false, flash: { startsAtUnix: START, endsAtUnix: END, showTeaser: true }, nowSeconds: START - 600, formatMoney: fmt,
  }).promoLine
  assert.deepEqual([1, 2, 3, 4].map(from), ['Get it from: £7.30', 'Get it from: £3.00', 'Get it from: £4.31', 'Get it from: £1.25'])
})

test('computeWidgetViewModel: a running sale has no "It is now" label and keeps its promo line', () => {
  const vm = flashVm({ addingQty: 2 })
  assert.deepEqual([vm.priceLabel, vm.promoLine], [null, 'Mix and match 8+ for £1.63 or 16+ for £1.55'])
})

test('computeWidgetViewModel: a running sale shows the chips and the drawer too', () => {
  const vm = flashVm({ addingQty: 9 })
  assert.deepEqual([vm.showChips, vm.showDrawer], [true, true])
})

test('computeWidgetViewModel: before the start with the teaser off, and after the end, only the plain price remains', () => {
  const off = flashVm({ nowSeconds: START - 60, flash: { startsAtUnix: START, endsAtUnix: END, showTeaser: false } })
  assert.deepEqual([off.flashBar.variant, off.showChrome, off.showCard, off.showChips, off.showDrawer, off.discountedPrice], ['hidden', false, false, false, false, null])
  const ended = flashVm({ nowSeconds: END, addingQty: 16 })
  assert.deepEqual([ended.flashBar.variant, ended.showChrome, ended.showCard, ended.discountedPrice, ended.plainPrice], ['hidden', false, false, null, '£1.69'])
})

test('computeWidgetViewModel: a quantity crossing a tier while running changes the bar variant', () => {
  assert.deepEqual([7, 8, 15, 16].map((qty) => flashVm({ addingQty: qty }).flashBar.variant), ['ends', 'tier-first', 'tier-first', 'tier-higher'])
})

test('computeWidgetViewModel: a single tier reads Tier 1 only, however many are added', () => {
  const tiers = [{ minQty: 1, percentOff: 0 }, { minQty: 8, fixedPrice: 1.63 }]
  assert.equal(flashVm({ tiers, addingQty: 30 }).flashBar.variant, 'tier-first')
})
