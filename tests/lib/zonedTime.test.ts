import { describe, it, expect } from 'vitest'
import { zonedTimeToUtc, zonedTimeToUnixSeconds } from '@/lib/zonedTime'
import { zonedTimeToUtc as zonedTimeToUtcFromShop } from '@/lib/shop'

describe('zonedTimeToUtc', () => {
  it('puts a London summer time one hour ahead of UTC', () => {
    expect(zonedTimeToUtc('2026-07-01T12:00', 'Europe/London')).toBe('2026-07-01T11:00:00.000Z')
  })

  it('puts a New York winter time five hours behind UTC', () => {
    expect(zonedTimeToUtc('2026-12-01T09:00', 'America/New_York')).toBe('2026-12-01T14:00:00.000Z')
  })

  it('is still available from the shop module, where the pages import it', () => {
    expect(zonedTimeToUtcFromShop).toBe(zonedTimeToUtc)
  })
})

describe('zonedTimeToUnixSeconds', () => {
  it('gives the same instant as Unix seconds', () => {
    expect(zonedTimeToUnixSeconds('2026-07-01T12:00', 'Europe/London')).toBe(1782903600)
  })
})
