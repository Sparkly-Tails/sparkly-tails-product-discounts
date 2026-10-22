import { describe, it, expect } from 'vitest'
import { computeFlashWindowUnix } from '@/flash/window'
import { zonedTimeToUtc } from '@/lib/shop'

describe('computeFlashWindowUnix', () => {
  it('turns the shop-local start and end into Unix seconds, through the injected converter', () => {
    const window = computeFlashWindowUnix({
      startsAt: '2026-03-01T12:00',
      endsAt: '2026-03-02T12:00',
      timeZone: 'Europe/London',
      convertToUtc: zonedTimeToUtc,
    })
    expect(window).toEqual({ startsAtUnix: Date.UTC(2026, 2, 1, 12, 0) / 1000, endsAtUnix: Date.UTC(2026, 2, 2, 12, 0) / 1000 })
  })

  it('shifts a summer time by the shop UTC offset (London is one hour ahead in summer)', () => {
    const window = computeFlashWindowUnix({
      startsAt: '2026-07-01T12:00',
      endsAt: '2026-07-01T18:00',
      timeZone: 'Europe/London',
      convertToUtc: zonedTimeToUtc,
    })
    expect(window.startsAtUnix).toBe(Date.UTC(2026, 6, 1, 11, 0) / 1000)
    expect(window.endsAtUnix).toBe(Date.UTC(2026, 6, 1, 17, 0) / 1000)
  })

  it('passes each text and the zone to the converter exactly once', () => {
    const calls: string[] = []
    computeFlashWindowUnix({
      startsAt: '2026-07-01T12:00',
      endsAt: '2026-07-02T12:00',
      timeZone: 'America/New_York',
      convertToUtc: (naive, zone) => { calls.push(naive + '@' + zone); return '2026-07-01T12:00:00.000Z' },
    })
    expect(calls).toEqual(['2026-07-01T12:00@America/New_York', '2026-07-02T12:00@America/New_York'])
  })
})
