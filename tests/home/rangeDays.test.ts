import { describe, it, expect } from 'vitest'
import { addDays, pickShopDay } from '@/home/rangeDays'

describe('addDays', () => {
  it('moves across a month end and a year end, forward and back', () => {
    expect(addDays({ day: '2026-10-31', count: 1 })).toBe('2026-11-01')
    expect(addDays({ day: '2026-12-31', count: 1 })).toBe('2027-01-01')
    expect(addDays({ day: '2026-11-02', count: -29 })).toBe('2026-10-04')
  })
})

describe('pickShopDay', () => {
  it('gives the calendar day it is in the shop time zone, not in UTC', () => {
    expect(pickShopDay({ nowIso: '2026-11-02T23:30:00.000Z', timeZone: 'Europe/London' })).toBe('2026-11-02')
    expect(pickShopDay({ nowIso: '2026-11-02T23:30:00.000Z', timeZone: 'Asia/Tokyo' })).toBe('2026-11-03')
    expect(pickShopDay({ nowIso: '2026-11-02T03:30:00.000Z', timeZone: 'America/Los_Angeles' })).toBe('2026-11-01')
  })
})
