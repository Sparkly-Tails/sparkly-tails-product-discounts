import { describe, it, expect } from 'vitest'
import { pickShopDay } from '@/metrics/pickShopDay'

describe('pickShopDay', () => {
  it('names the day in the shop time zone, not in UTC', () => {
    const instant = Date.parse('2026-11-02T23:30:00Z')
    expect(pickShopDay({ nowMs: instant, timeZone: 'UTC' })).toBe('2026-11-02')
    expect(pickShopDay({ nowMs: instant, timeZone: 'Pacific/Auckland' })).toBe('2026-11-03')
    expect(pickShopDay({ nowMs: instant, timeZone: 'America/Los_Angeles' })).toBe('2026-11-02')
  })

  it('moves to the next day at local midnight (23:59 and 00:01 in Auckland)', () => {
    expect(pickShopDay({ nowMs: Date.parse('2026-11-02T10:59:00Z'), timeZone: 'Pacific/Auckland' })).toBe('2026-11-02')
    expect(pickShopDay({ nowMs: Date.parse('2026-11-02T11:01:00Z'), timeZone: 'Pacific/Auckland' })).toBe('2026-11-03')
  })
})
