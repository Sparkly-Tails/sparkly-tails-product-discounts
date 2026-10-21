import { describe, it, expect } from 'vitest'
import { formatMoneyAmount } from '@/home/formatMoney'

describe('formatMoneyAmount', () => {
  it('formats an amount in the shop currency', () => {
    expect(formatMoneyAmount({ amount: 1.5, currencyCode: 'GBP' })).toBe('£1.50')
    expect(formatMoneyAmount({ amount: 1.5, currencyCode: 'USD' })).toBe('$1.50')
  })

  it('falls back to two plain decimals when the currency code is not valid', () => {
    expect(formatMoneyAmount({ amount: 1.5, currencyCode: '???' })).toBe('1.50')
  })
})
