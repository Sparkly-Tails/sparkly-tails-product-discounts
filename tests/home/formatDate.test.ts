import { describe, it, expect } from 'vitest'
import { formatNaiveDate } from '@/home/formatDate'

describe('formatNaiveDate', () => {
  it('formats a shop-local datetime as "Mon D, YYYY" without any timezone shift', () => {
    expect(formatNaiveDate({ value: '2026-11-27T09:00' })).toBe('Nov 27, 2026')
    expect(formatNaiveDate({ value: '2026-01-01T00:00' })).toBe('Jan 1, 2026')
    expect(formatNaiveDate({ value: '2026-12-31T23:59' })).toBe('Dec 31, 2026')
  })

  it('returns a value it cannot read unchanged', () => {
    expect(formatNaiveDate({ value: 'soon' })).toBe('soon')
    expect(formatNaiveDate({ value: '' })).toBe('')
    expect(formatNaiveDate({ value: '2026-13-01T00:00' })).toBe('2026-13-01T00:00')
  })
})
