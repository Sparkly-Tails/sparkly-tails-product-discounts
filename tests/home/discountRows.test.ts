import { describe, it, expect } from 'vitest'
import {
  buildDiscountRows,
  buildTierRow,
  buildTimeRow,
  describeTierRules,
  describeTimeSchedule,
  listTierSteps,
  pickRowSubtitle,
  pickRowTitle,
} from '@/home/discountRows'
import { formatNaiveDate } from '@/home/formatDate'

const formatPounds = ({ amount }: { amount: number; currencyCode: string }) => '£' + amount.toFixed(2)
const formatDate = formatNaiveDate

describe('describeTierRules', () => {
  const base = { currencyCode: 'GBP', formatMoney: formatPounds }

  it('lists each percent tier as "N+ units (P% off)"', () => {
    const text = describeTierRules({ ...base, steps: [{ minQty: 3, amount: 10 }, { minQty: 5, amount: 20 }], pricingMode: 'percent' })
    expect(text).toBe('3+ units (10% off), 5+ units (20% off)')
  })

  it('lists each fixed-price tier with the money text of the shop', () => {
    const text = describeTierRules({ ...base, steps: [{ minQty: 3, amount: 1.5 }], pricingMode: 'fixed' })
    expect(text).toBe('3+ units (£1.50 each)')
  })

  it('sorts the steps by quantity and does not change the list it was given', () => {
    const steps = [{ minQty: 5, amount: 20 }, { minQty: 3, amount: 10 }]
    const text = describeTierRules({ ...base, steps, pricingMode: 'percent' })
    expect(text).toBe('3+ units (10% off), 5+ units (20% off)')
    expect(steps[0].minQty).toBe(5)
  })

  it('gives an empty text for a discount without tiers', () => {
    expect(describeTierRules({ ...base, steps: [], pricingMode: 'percent' })).toBe('')
  })
})

describe('listTierSteps', () => {
  it('takes the percent of each tier in percent mode and the price in fixed mode', () => {
    const tiers = [{ minQty: 3, percentOff: 10 }, { minQty: 5, fixedPrice: 1.5 }]
    expect(listTierSteps({ tiers, pricingMode: 'percent' })).toEqual([{ minQty: 3, amount: 10 }, { minQty: 5, amount: 0 }])
    expect(listTierSteps({ tiers, pricingMode: 'fixed' })).toEqual([{ minQty: 3, amount: 0 }, { minQty: 5, amount: 1.5 }])
  })

  it('gives no steps for no tiers', () => {
    expect(listTierSteps({ tiers: [], pricingMode: 'percent' })).toEqual([])
  })
})

describe('describeTimeSchedule', () => {
  const dates = { startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', formatDate }

  it('shows the whole window for an upcoming discount', () => {
    expect(describeTimeSchedule({ ...dates, statusLabel: 'Upcoming' })).toBe('Nov 27, 2026 - Nov 30, 2026 (Scheduled)')
  })

  it('shows when an active discount ends', () => {
    expect(describeTimeSchedule({ ...dates, statusLabel: 'Active' })).toBe('Ends Nov 30, 2026')
  })

  it('shows when an expired discount ended', () => {
    expect(describeTimeSchedule({ ...dates, statusLabel: 'Expired' })).toBe('Ended Nov 30, 2026')
  })

  it('does not throw or print "Invalid Date" for dates that cannot be read', () => {
    const text = describeTimeSchedule({ startsAt: 'soon', endsAt: '', statusLabel: 'Expired', formatDate })
    expect(typeof text).toBe('string')
    expect(text).not.toContain('Invalid Date')
  })
})

describe('pickRowTitle and pickRowSubtitle', () => {
  it('uses the name, then the customer title, then "Untitled discount"', () => {
    expect(pickRowTitle({ name: 'Salmon Oil', title: 'Buy more' })).toBe('Salmon Oil')
    expect(pickRowTitle({ name: '  ', title: 'Buy more' })).toBe('Buy more')
    expect(pickRowTitle({ name: '', title: ' ' })).toBe('Untitled discount')
  })

  it('shows the customer title as a subtitle only when it adds something', () => {
    expect(pickRowSubtitle({ rowTitle: 'Salmon Oil', title: 'Buy more' })).toBe('Buy more')
    expect(pickRowSubtitle({ rowTitle: 'Salmon Oil', title: 'Salmon Oil' })).toBe('')
    expect(pickRowSubtitle({ rowTitle: 'Untitled discount', title: ' ' })).toBe('')
  })
})

describe('buildTierRow', () => {
  const base = { discountId: 'disc 1/a', name: 'Salmon Oil', title: 'Buy more, save more', status: 'live' as const, rules: '3+ units (10% off)', pickTitle: pickRowTitle, pickSubtitle: pickRowSubtitle }

  it('maps a live discount to an active row that links to its edit page', () => {
    expect(buildTierRow(base)).toEqual({
      key: 'tier:disc 1/a',
      kind: 'tier',
      title: 'Salmon Oil',
      subtitle: 'Buy more, save more',
      rules: '3+ units (10% off)',
      isActive: true,
      href: '/discounts/disc%201%2Fa',
    })
  })

  it('maps a draft discount to an inactive row', () => {
    expect(buildTierRow({ ...base, status: 'draft' }).isActive).toBe(false)
  })

  it('uses the customer title as the row title when the name is blank, with no repeated subtitle', () => {
    const row = buildTierRow({ ...base, name: '  ' })
    expect([row.title, row.subtitle]).toEqual(['Buy more, save more', ''])
  })

  it('falls back to "Untitled discount" when both are blank', () => {
    const row = buildTierRow({ ...base, name: '', title: '' })
    expect([row.title, row.subtitle]).toEqual(['Untitled discount', ''])
  })
})

describe('buildTimeRow', () => {
  const base = { discountId: 'td1', title: 'Spring Sale', schedule: 'Ends Nov 30, 2026', statusLabel: 'Active' as const, pickTitle: pickRowTitle }

  it('maps an active discount to an active row that links to its edit page', () => {
    expect(buildTimeRow(base)).toEqual({
      key: 'time:td1',
      kind: 'time',
      title: 'Spring Sale',
      subtitle: '',
      rules: 'Ends Nov 30, 2026',
      isActive: true,
      href: '/time-discounts/td1',
    })
  })

  it('maps upcoming and expired discounts to inactive rows', () => {
    expect(buildTimeRow({ ...base, statusLabel: 'Upcoming' }).isActive).toBe(false)
    expect(buildTimeRow({ ...base, statusLabel: 'Expired' }).isActive).toBe(false)
  })

  it('falls back to "Untitled discount" for a blank title', () => {
    expect(buildTimeRow({ ...base, title: ' ' }).title).toBe('Untitled discount')
  })
})

describe('buildDiscountRows', () => {
  it('puts the tier rows before the time-based rows and keeps each stored order', () => {
    const tool = { pickTitle: pickRowTitle, pickSubtitle: pickRowSubtitle }
    const tierRows = [
      buildTierRow({ discountId: 'a', name: 'A', title: '', status: 'live', rules: '', ...tool }),
      buildTierRow({ discountId: 'b', name: 'B', title: '', status: 'live', rules: '', ...tool }),
    ]
    const timeRows = [buildTimeRow({ discountId: 'c', title: 'C', schedule: '', statusLabel: 'Active', pickTitle: pickRowTitle })]
    expect(buildDiscountRows({ tierRows, timeRows }).map((row) => row.key)).toEqual(['tier:a', 'tier:b', 'time:c'])
  })
})
