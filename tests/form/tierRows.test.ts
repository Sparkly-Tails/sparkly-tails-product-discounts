import { describe, it, expect } from 'vitest'
import {
  isPercentRowComplete, isFixedRowComplete, parseAnchorPrice, buildPercentTiers, buildFixedTiers, describePercentTier, describeFixedTier,
  buildPercentRows, buildFixedRows, updateRow, keepOtherRows, readCurrencySymbol,
  type PercentRowValues, type FixedRowValues,
} from '@/form/tierRows'
import { totalAtThreshold, clampedFixedPrice } from '@/lib/tier-math'

const formatPrice = (amount: number) => '$' + amount.toFixed(2)
const percentRow = (minQty: string, percentOff: string, anchorPrice = ''): PercentRowValues => ({ key: minQty + percentOff, minQty, percentOff, anchorPrice })
const fixedRow = (minQty: string, fixedPrice: string): FixedRowValues => ({ key: minQty + fixedPrice, minQty, fixedPrice })

describe('isPercentRowComplete', () => {
  it.each([
    [percentRow('3', '10'), true],
    [percentRow('3', '0'), true],
    [percentRow('', '10'), false],
    [percentRow('0', '10'), false],
    [percentRow('3', ''), false],
    [percentRow('3', '  '), false],
    [percentRow('3', '-5'), false],
  ])('judges %j as %s', (row, expected) => {
    expect(isPercentRowComplete(row)).toBe(expected)
  })
})

describe('isFixedRowComplete', () => {
  it.each([
    [fixedRow('3', '1.5'), true],
    [fixedRow('3', '0'), false],
    [fixedRow('', '1.5'), false],
    [fixedRow('3', ''), false],
  ])('judges %j as %s', (row, expected) => {
    expect(isFixedRowComplete(row)).toBe(expected)
  })
})

describe('parseAnchorPrice', () => {
  it('reads a typed price', () => {
    expect(parseAnchorPrice({ text: '600.50', isAllowed: true })).toBe(600.5)
  })

  it('has no anchor price for empty text or when anchor prices are not allowed', () => {
    expect(parseAnchorPrice({ text: ' ', isAllowed: true })).toBeUndefined()
    expect(parseAnchorPrice({ text: '600', isAllowed: false })).toBeUndefined()
  })
})

describe('buildPercentTiers', () => {
  const tools = { isPercentRowComplete, parseAnchorPrice }

  it('keeps the complete rows, sorted by minimum quantity, with their anchor prices', () => {
    const rows = [percentRow('5', '15'), percentRow('', '99'), percentRow('2', '10', '600')]
    expect(buildPercentTiers({ rows, isAnchorAllowed: true, tools })).toEqual([
      { minQty: 2, percentOff: 10, anchorPrice: 600 },
      { minQty: 5, percentOff: 15, anchorPrice: undefined },
    ])
  })

  it('leaves the anchor prices out when they are not allowed', () => {
    expect(buildPercentTiers({ rows: [percentRow('2', '10', '600')], isAnchorAllowed: false, tools })).toEqual([{ minQty: 2, percentOff: 10, anchorPrice: undefined }])
  })

  it('returns no tiers when no row is complete', () => {
    expect(buildPercentTiers({ rows: [percentRow('', '')], isAnchorAllowed: true, tools })).toEqual([])
  })
})

describe('buildFixedTiers', () => {
  it('keeps the complete rows, sorted by minimum quantity', () => {
    expect(buildFixedTiers({ rows: [fixedRow('4', '1.2'), fixedRow('2', '1.4'), fixedRow('', '3')], tools: { isFixedRowComplete } })).toEqual([
      { minQty: 2, fixedPrice: 1.4 },
      { minQty: 4, fixedPrice: 1.2 },
    ])
  })
})

describe('describePercentTier', () => {
  const tools = { totalAtThreshold }

  it('shows the price each and the percentage for a percentage tier', () => {
    expect(describePercentTier({ basePrice: 28, minQty: 3, percentOff: 10, anchorPrice: undefined, formatPrice, tools })).toEqual({ eachLabel: '$25.20 ea', offLabel: '10% off' })
  })

  it('works out the price each and the real percentage from an anchor price', () => {
    expect(describePercentTier({ basePrice: 729.95, minQty: 2, percentOff: 5, anchorPrice: 600, formatPrice, tools })).toEqual({ eachLabel: '$300.00 ea', offLabel: '58.9% off' })
  })

  it('shows nothing until there is a price to work from', () => {
    expect(describePercentTier({ basePrice: null, minQty: 3, percentOff: 10, anchorPrice: undefined, formatPrice, tools })).toEqual({ eachLabel: '', offLabel: '' })
  })
})

describe('describeFixedTier', () => {
  const tools = { clampedFixedPrice }

  it('shows the fixed price each and how much that is off the price', () => {
    expect(describeFixedTier({ basePrice: 28, fixedPrice: 21, formatPrice, tools })).toEqual({ eachLabel: '$21.00 ea', offLabel: '25% off' })
  })

  it('never shows more than the price of the product', () => {
    expect(describeFixedTier({ basePrice: 28, fixedPrice: 40, formatPrice, tools })).toEqual({ eachLabel: '$28.00 ea', offLabel: '0% off' })
  })

  it('shows nothing until there is a price to work from', () => {
    expect(describeFixedTier({ basePrice: null, fixedPrice: 21, formatPrice, tools })).toEqual({ eachLabel: '', offLabel: '' })
  })
})

describe('buildPercentRows', () => {
  it('turns saved tiers into rows of text with their own keys', () => {
    let count = 0
    const rows = buildPercentRows({ tiers: [{ minQty: 2, percentOff: 10, anchorPrice: 600 }, { minQty: 4, percentOff: 15 }], makeKey: () => `key-${++count}` })
    expect(rows).toEqual([
      { key: 'key-1', minQty: '2', percentOff: '10', anchorPrice: '600' },
      { key: 'key-2', minQty: '4', percentOff: '15', anchorPrice: '' },
    ])
  })

  it('returns no rows for no tiers', () => {
    expect(buildPercentRows({ tiers: [], makeKey: () => 'k' })).toEqual([])
  })
})

describe('buildFixedRows', () => {
  it('turns saved fixed-price tiers into rows of text', () => {
    expect(buildFixedRows({ tiers: [{ minQty: 3, fixedPrice: 1.5 }], makeKey: () => 'k1' })).toEqual([{ key: 'k1', minQty: '3', fixedPrice: '1.5' }])
  })
})

describe('updateRow', () => {
  it('changes one field of the row with that key and nothing else', () => {
    const rows = [percentRow('2', '10'), percentRow('4', '15')]
    expect(updateRow({ rows, key: rows[1].key, field: 'percentOff', value: '20' })).toEqual([rows[0], { ...rows[1], percentOff: '20' }])
  })

  it('leaves the rows alone when no row has the key', () => {
    const rows = [percentRow('2', '10')]
    expect(updateRow({ rows, key: 'nope', field: 'minQty', value: '9' })).toEqual(rows)
  })
})

describe('keepOtherRows', () => {
  it('drops the row with that key', () => {
    const rows = [percentRow('2', '10'), percentRow('4', '15')]
    expect(keepOtherRows({ rows, key: rows[0].key })).toEqual([rows[1]])
  })
})

describe('readCurrencySymbol', () => {
  it.each([['USD', '$'], ['GBP', '£'], ['EUR', '€']])('reads the symbol of %s', (currencyCode, symbol) => {
    expect(readCurrencySymbol({ currencyCode })).toBe(symbol)
  })
})
