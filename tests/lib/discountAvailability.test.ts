import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isAvailableEverywhere, fetchAvailabilityConfigs } from '@/lib/discountAvailability'
import * as configLib from '@/lib/config'
import * as timeConfigLib from '@/timeDiscounts/config'
import type { Config } from '@/lib/config'
import type { TimeDiscountsConfig } from '@/timeDiscounts/config'

const productConfig: Config = {
  discounts: [
    { discountId: 'disc_1', name: 'X', title: 'X', status: 'live', pricingMode: 'percent', members: [{ productId: 'gid://shopify/Product/1' }], tiers: [] },
  ],
}

const timeConfig: TimeDiscountsConfig = {
  discounts: [
    {
      discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'Y', title: 'Y', pricingMode: 'percent', amount: 10,
      startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
      selection: { mode: 'products', members: [{ productId: 'gid://shopify/Product/2' }] },
      resolvedMembers: [{ productId: 'gid://shopify/Product/2' }],
    },
  ],
}

describe('isAvailableEverywhere', () => {
  it('is false for a product claimed by the existing tiered-discount system', () => {
    expect(isAvailableEverywhere(productConfig, timeConfig, 'gid://shopify/Product/1', undefined)).toBe(false)
  })

  it('is false for a product claimed by another time discount', () => {
    expect(isAvailableEverywhere(productConfig, timeConfig, 'gid://shopify/Product/2', undefined)).toBe(false)
  })

  it('is true for a product claimed nowhere', () => {
    expect(isAvailableEverywhere(productConfig, timeConfig, 'gid://shopify/Product/3', undefined)).toBe(true)
  })

  it('excludes only within the matching kind\'s config, by id', () => {
    // A time-discount id excludes only within timeConfig; it has no effect
    // on productConfig, and vice versa — ids from the two kinds never
    // collide (both are crypto.randomUUID()-based), so this is a no-op
    // cross-kind, not a bug.
    expect(isAvailableEverywhere(productConfig, timeConfig, 'gid://shopify/Product/1', undefined, 'time_disc_1')).toBe(false)
  })
})

describe('fetchAvailabilityConfigs', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('fetches both configs and returns them together — the only place @/lib/config and @/timeDiscounts/config meet', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue(productConfig)
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue(timeConfig)

    const result = await fetchAvailabilityConfigs()

    expect(result).toEqual({ productConfig, timeConfig })
  })
})
