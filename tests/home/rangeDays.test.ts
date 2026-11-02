import { describe, it, expect } from 'vitest'
import { addDays, pickShopDay, listRangePresets, buildMonthGrid, formatRangeLabel } from '@/home/rangeDays'

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

describe('listRangePresets', () => {
  const presets = listRangePresets({ today: '2026-11-02' })
  const byKey = (key: string) => presets.find((preset) => preset.key === key)

  it('has the eight presets in order with their labels', () => {
    expect(presets.map((preset) => [preset.key, preset.label])).toEqual([
      ['today', 'Today'], ['yesterday', 'Yesterday'], ['last7', 'Last 7 days'], ['lastWeek', 'Last week'],
      ['last30', 'Last 30 days'], ['last90', 'Last 90 days'], ['thisMonth', 'This month'], ['lastMonth', 'Last month'],
    ])
  })

  it('works out the days of each preset when today is a Monday', () => {
    const days = (key: string) => [byKey(key)?.fromDay, byKey(key)?.toDay]
    expect(days('today')).toEqual(['2026-11-02', '2026-11-02'])
    expect(days('yesterday')).toEqual(['2026-11-01', '2026-11-01'])
    expect(days('last7')).toEqual(['2026-10-27', '2026-11-02'])
    expect(days('lastWeek')).toEqual(['2026-10-26', '2026-11-01'])
    expect(days('last30')).toEqual(['2026-10-04', '2026-11-02'])
    expect(days('last90')).toEqual(['2026-08-05', '2026-11-02'])
    expect(days('thisMonth')).toEqual(['2026-11-01', '2026-11-02'])
    expect(days('lastMonth')).toEqual(['2026-10-01', '2026-10-31'])
  })

  it('takes the previous Monday to Sunday as last week on a Sunday, and January as the month before February', () => {
    const sunday = listRangePresets({ today: '2026-11-08' }).find((preset) => preset.key === 'lastWeek')
    expect([sunday?.fromDay, sunday?.toDay]).toEqual(['2026-10-26', '2026-11-01'])
    const february = listRangePresets({ today: '2027-02-10' }).find((preset) => preset.key === 'lastMonth')
    expect([february?.fromDay, february?.toDay]).toEqual(['2027-01-01', '2027-01-31'])
  })
})

describe('buildMonthGrid', () => {
  it('starts on a Monday, pads with nothing before the first day, and has every day of the month once', () => {
    const grid = buildMonthGrid({ monthStart: '2026-11-01' })
    expect(grid.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01'])
    expect(grid.filter((cell) => cell !== null)).toHaveLength(30)
    expect(grid.length % 7).toBe(0)
  })
})

describe('formatRangeLabel', () => {
  it('writes a range as "12 Oct – 2 Nov" and a single day as one day', () => {
    expect(formatRangeLabel({ fromDay: '2026-10-12', toDay: '2026-11-02' })).toBe('12 Oct – 2 Nov')
    expect(formatRangeLabel({ fromDay: '2026-11-02', toDay: '2026-11-02' })).toBe('2 Nov')
  })
})
