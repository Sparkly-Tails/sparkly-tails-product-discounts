// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  POPUP_TEXT, buildBoxTitle, buildBadgeText, buildIncentiveText, buildQuickLabelText, buildQuickButtonText, buildQuickAddText, buildViewText, buildCostText, buildShowingText, buildMoreText, buildPreviewText, buildChips, readTierMode, COPY_TOOLS,
} from '../../extensions/product-tier-pricing/src/popup/copy.js'
import { readBoxLook, applyBoxLook, LOOK_TOOLS } from '../../extensions/product-tier-pricing/src/popup/look.js'

const formatMoneyText = (amount: number) => '£' + amount.toFixed(2)
const FIXED_TIER = { minQty: 8, fixedPrice: 1.63 }
const PERCENT_TIER = { minQty: 3, percentOff: 15 }

describe('the texts', () => {
  it('has the header words of the design: the eyebrow, the heading and the intro, the same for one box or several', () => {
    expect(POPUP_TEXT.eyebrow).toBe('🎯 Unclaimed Bundle Savings')
    expect(POPUP_TEXT.heading).toBe('Wait, complete your bundle to unlock instant savings')
    expect(POPUP_TEXT.intro).toBe('You are only a few units away from triggering volume discount rates on qualifying items.')
  })

  it('writes how many of the eligible items are listed, and the button that lists more or fewer', () => {
    expect(buildShowingText({ shown: 4, total: 12 })).toBe('Showing 4 of 12 eligible items')
    expect(buildMoreText({ count: 8, isOpen: false })).toBe('Show 8 more')
    expect(buildMoreText({ count: 8, isOpen: true })).toBe('Show fewer')
  })

  it('writes what the customer has of the bundle and how many more are needed', () => {
    expect(buildPreviewText({ entries: [{ label: 'Tuna', quantity: 2 }, { label: 'Salmon', quantity: 1 }], missing: 5 })).toBe('2× Tuna, 1× Salmon (5 more needed for discount)')
  })

  it('titles a box by its title, or "Your bundle" when the index has none (Review Focus 1)', () => {
    expect(buildBoxTitle({ title: 'Tins mix' })).toBe('Tins mix')
    expect(buildBoxTitle({ title: '' })).toBe('Your bundle')
    expect(buildBoxTitle({ title: undefined })).toBe('Your bundle')
  })

  it('reads the mode of a tier: fixed only with a fixed price', () => {
    expect(readTierMode({ tier: FIXED_TIER })).toBe('fixed')
    expect(readTierMode({ tier: PERCENT_TIER })).toBe('percent')
  })

  it('writes the badge for a fixed and a percent tier', () => {
    expect(buildBadgeText({ tier: FIXED_TIER, mode: 'fixed' })).toBe('Tier 1 at 8 items')
    expect(buildBadgeText({ tier: PERCENT_TIER, mode: 'percent' })).toBe('Unlock 15% off at 3 units')
  })

  it('writes the incentive of a fixed tier with the saving when the plain price is known', () => {
    const input = { tier: FIXED_TIER, units: 5, missing: 3, basePrice: 1.69, formatMoneyText, tools: COPY_TOOLS }
    expect(buildIncentiveText(input)).toBe('Currently 5 units selected • Add 3 more to unlock £1.63/ea (Save £0.48 on these items!)')
    expect(buildIncentiveText({ ...input, basePrice: null })).toBe('Currently 5 units selected • Add 3 more to unlock £1.63/ea')
  })

  it('leaves the saving out when the tier is not cheaper than the plain price', () => {
    expect(buildIncentiveText({ tier: FIXED_TIER, units: 5, missing: 3, basePrice: 1.63, formatMoneyText, tools: COPY_TOOLS })).toBe('Currently 5 units selected • Add 3 more to unlock £1.63/ea')
  })

  it('writes the incentive of a percent tier', () => {
    expect(buildIncentiveText({ tier: PERCENT_TIER, units: 2, missing: 1, basePrice: 1.69, formatMoneyText, tools: COPY_TOOLS })).toBe('2 of 3 items selected • Add 1 more to unlock 15% off the whole bundle')
  })

  it('writes the Quick auto-fill texts, the contracted buttons and the cost', () => {
    expect(buildQuickLabelText({ missing: 3 })).toBe('⚡ Quick auto-fill: Add 3 more items')
    expect(buildQuickButtonText({ missing: 3 })).toBe('Add 3 & unlock tier')
    expect(buildQuickAddText({ tier: PERCENT_TIER, missing: 1, formatMoneyText })).toBe('⚡ Quick-add 1 to unlock 15% OFF')
    expect(buildQuickAddText({ tier: FIXED_TIER, missing: 3, formatMoneyText })).toBe('⚡ Quick-add 3 to unlock £1.63/ea')
    expect(buildViewText({ count: 4 })).toBe('View & mix eligible products (4 available)')
    expect(buildCostText({ cost: 4.95, formatMoneyText })).toBe('(+£4.95)')
  })
})

describe('buildChips', () => {
  const TIERS = [{ minQty: 8, fixedPrice: 1.63 }, { minQty: 16, fixedPrice: 1.55 }]
  const chipsFor = (overrides: { tiers?: object[]; basePrice?: number | null; units?: number }) =>
    buildChips({ tiers: TIERS, basePrice: 1.69, units: 5, formatMoneyText, tools: COPY_TOOLS, ...overrides })
  const labels = (chips: { label: string }[]) => chips.map((chip) => chip.label)

  it('shows 1 unit, the current units, the first tier and the next tier, as totals', () => {
    expect(labels(chipsFor({}))).toEqual(['1 × £1.69', '5 × £8.45', '8 × £13.04', '16 × £24.80'])
  })

  it('does not repeat the first chip when the current units are 1', () => {
    expect(labels(chipsFor({ units: 1 }))).toEqual(['1 × £1.69', '8 × £13.04', '16 × £24.80'])
  })

  it('does not show a third tier', () => {
    const three = [...TIERS, { minQty: 24, fixedPrice: 1.5 }]
    expect(labels(chipsFor({ tiers: three }))).toEqual(['1 × £1.69', '5 × £8.45', '8 × £13.04', '16 × £24.80'])
  })

  it('shows the first tier alone when it is the only tier', () => {
    expect(labels(chipsFor({ tiers: [TIERS[0]] }))).toEqual(['1 × £1.69', '5 × £8.45', '8 × £13.04'])
  })

  it('shows no chips when the plain price is not known', () => {
    expect(chipsFor({ basePrice: null })).toEqual([])
  })
})

describe('readBoxLook', () => {
  const look = (style: unknown, creamFallback = '#F3ECD9') => readBoxLook({ style, creamFallback, tools: LOOK_TOOLS })

  it('takes the discount\'s own colour (upper-cased) and radius', () => {
    expect(look({ backgroundColor: '#aabbcc', cornerRadius: 8 })).toEqual({ background: '#AABBCC', radius: 8 })
  })

  it('accepts a colour with transparency', () => {
    expect(look({ backgroundColor: '#AABBCC80', cornerRadius: 0 })).toEqual({ background: '#AABBCC80', radius: 0 })
  })

  it('falls back to the embed colour for a colour that is not a whole hex code', () => {
    for (const bad of ['red', '#12', 'url(x)', '#GGGGGG', '#abc', '', 5, null]) expect(look({ backgroundColor: bad, cornerRadius: 4 }).background).toBe('#F3ECD9')
  })

  it('has no radius for one out of range or not a whole number', () => {
    for (const bad of [30, -1, '12', 1.5, null]) expect(look({ backgroundColor: '#aabbcc', cornerRadius: bad }).radius).toBeNull()
  })

  it('works without any style (Review Focus 1): the embed colour and no radius', () => {
    expect(look(undefined)).toEqual({ background: '#F3ECD9', radius: null })
  })

  it('gives no colour at all when neither the style nor the embed colour is a hex code', () => {
    expect(look({ backgroundColor: 'red' }, 'blue').background).toBe('')
  })
})

describe('applyBoxLook', () => {
  const apply = (look: { background: string; radius: number | null }, accents = { moss: '#434625', sun: '#ffdc4c' }) => {
    const box = document.createElement('div')
    applyBoxLook({ box, look, accents, tools: LOOK_TOOLS })
    return (name: string) => box.style.getPropertyValue(name)
  }

  it('sets the widget\'s four custom properties on the box', () => {
    const read = apply({ background: '#AABBCC', radius: 8 })
    expect([read('--smooth-discounts-cream'), read('--smooth-discounts-radius'), read('--smooth-discounts-moss'), read('--smooth-discounts-sun')]).toEqual(['#AABBCC', '8px', '#434625', '#FFDC4C'])
  })

  it('sets no radius for a null radius, and nothing for a colour that is not a hex code', () => {
    const read = apply({ background: '', radius: null }, { moss: 'red', sun: '#ffdc4c' })
    expect([read('--smooth-discounts-cream'), read('--smooth-discounts-radius'), read('--smooth-discounts-moss'), read('--smooth-discounts-sun')]).toEqual(['', '', '', '#FFDC4C'])
  })
})
