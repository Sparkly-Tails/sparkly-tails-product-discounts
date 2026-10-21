import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getShopCurrencyCode, getShopTimezone, zonedTimeToUtc } from '@/lib/shop'
import * as shopifyClient from '@/lib/shopify-client'

describe('getShopTimezone', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns the shop\'s IANA timezone', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ shop: { ianaTimezone: 'Europe/London' } })
    expect(await getShopTimezone()).toBe('Europe/London')
  })
})

describe('getShopCurrencyCode', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns the currency code of the shop', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ shop: { currencyCode: 'GBP' } })
    expect(await getShopCurrencyCode()).toBe('GBP')
    expect(spy.mock.calls[0][0]).toContain('currencyCode')
  })
})

describe('zonedTimeToUtc', () => {
  it('converts a naive shop-local time to UTC when the zone has zero offset (GMT, winter)', () => {
    expect(zonedTimeToUtc('2026-03-01T12:00', 'Europe/London')).toBe('2026-03-01T12:00:00.000Z')
  })

  it('converts a naive shop-local time to UTC across a DST offset (BST, summer, +1)', () => {
    expect(zonedTimeToUtc('2026-07-01T12:00', 'Europe/London')).toBe('2026-07-01T11:00:00.000Z')
  })

  it('converts correctly for a negative-offset zone (America/New_York, EDT, -4 in summer)', () => {
    expect(zonedTimeToUtc('2026-07-01T12:00', 'America/New_York')).toBe('2026-07-01T16:00:00.000Z')
  })
})
