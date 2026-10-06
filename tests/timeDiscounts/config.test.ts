import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getTimeDiscountsConfig, saveTimeDiscountsConfig, isTimeDiscountMemberAvailable, fixedPriceNotLowerError,
  computeTimeDiscountStatusLabel, type TimeDiscountsConfig,
} from '@/timeDiscounts/config'
import * as shopifyClient from '@/lib/shopify-client'

describe('getTimeDiscountsConfig', () => {
  beforeEach(() => vi.restoreAllMocks())

  const mockStoredConfig = (value: unknown) => vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ shop: { metafield: { value: JSON.stringify(value) } } })

  it('parses the stored config JSON', async () => {
    const stored: TimeDiscountsConfig = {
      discounts: [
        {
          discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'Flash Sale', title: 'Flash Sale',
          kind: 'perProduct', startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
          items: [{ productId: 'gid://shopify/Product/1', pricingMode: 'percent', amount: 20 }],
        },
      ],
    }
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ shop: { metafield: { value: JSON.stringify(stored) } } })

    const config = await getTimeDiscountsConfig()
    expect(config).toEqual(stored)
  })

  it('reads a discount stored without a kind as a per-product discount', async () => {
    mockStoredConfig({ discounts: [{ discountId: 'd1', shopifyDiscountId: 'g1', name: 'A', title: 'A', startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00', items: [] }] })
    const { discounts } = await getTimeDiscountsConfig()
    expect(discounts[0].kind).toBe('perProduct')
  })

  it('keeps the kind and the group of a stored group discount', async () => {
    const group = { pricingMode: 'percent', amount: 20, selection: { mode: 'collections', collections: [{ id: 'gid://shopify/Collection/1', title: 'Summer' }] } }
    mockStoredConfig({ discounts: [{ discountId: 'd1', shopifyDiscountId: 'g1', name: 'A', title: 'A', startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00', kind: 'group', group, items: [] }] })
    const { discounts } = await getTimeDiscountsConfig()
    expect(discounts[0]).toMatchObject({ kind: 'group', group })
  })

  it('returns an empty discount list when no metafield exists yet', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ shop: { metafield: null } })
    expect(await getTimeDiscountsConfig()).toEqual({ discounts: [] })
  })

  it('normalizes a stored value with no discounts array instead of throwing', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ shop: { metafield: { value: '{}' } } })
    expect(await getTimeDiscountsConfig()).toEqual({ discounts: [] })
  })
})

describe('saveTimeDiscountsConfig', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('writes the config as a JSON shop metafield under the time-discounts namespace', async () => {
    const shopIdSpy = vi.spyOn(shopifyClient, 'shopifyQuery')
    shopIdSpy.mockResolvedValueOnce({ shop: { id: 'gid://shopify/Shop/1' } })
    shopIdSpy.mockResolvedValueOnce({ metafieldsSet: { userErrors: [] } })

    const config: TimeDiscountsConfig = { discounts: [] }
    await saveTimeDiscountsConfig(config)

    expect(shopIdSpy).toHaveBeenCalledTimes(2)
    expect(shopIdSpy).toHaveBeenLastCalledWith(
      expect.stringContaining('metafieldsSet'),
      expect.objectContaining({
        metafields: [
          expect.objectContaining({
            ownerId: 'gid://shopify/Shop/1',
            namespace: 'sparkly_time_discounts',
            key: 'config',
            type: 'json',
            value: JSON.stringify(config),
          }),
        ],
      }),
    )
  })

  it('throws when Shopify reports userErrors', async () => {
    const shopIdSpy = vi.spyOn(shopifyClient, 'shopifyQuery')
    shopIdSpy.mockResolvedValueOnce({ shop: { id: 'gid://shopify/Shop/1' } })
    shopIdSpy.mockResolvedValueOnce({ metafieldsSet: { userErrors: [{ field: ['value'], message: 'Invalid JSON' }] } })
    await expect(saveTimeDiscountsConfig({ discounts: [] })).rejects.toThrow('Invalid JSON')
  })
})

describe('isTimeDiscountMemberAvailable', () => {
  const baseConfig: TimeDiscountsConfig = {
    discounts: [
      {
        discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'X', title: 'X',
        kind: 'perProduct', startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
        items: [{ productId: 'gid://shopify/Product/1', pricingMode: 'percent', amount: 10 }],
      },
      {
        discountId: 'time_disc_2', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/2', name: 'Y', title: 'Y',
        kind: 'perProduct', startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
        items: [
          { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20', pricingMode: 'percent', amount: 10 },
          { productId: 'gid://shopify/Product/3', pricingMode: 'fixed', amount: 5 },
        ],
      },
    ],
  }

  it('is false for a product already claimed as a whole-product member', () => {
    expect(isTimeDiscountMemberAvailable(baseConfig, 'gid://shopify/Product/1', undefined)).toBe(false)
  })

  it('is false for the exact same variant already claimed', () => {
    expect(isTimeDiscountMemberAvailable(baseConfig, 'gid://shopify/Product/2', 'gid://shopify/ProductVariant/20')).toBe(false)
  })

  it('is true for a different variant of a product that only has one specific variant claimed', () => {
    expect(isTimeDiscountMemberAvailable(baseConfig, 'gid://shopify/Product/2', 'gid://shopify/ProductVariant/21')).toBe(true)
  })

  it('is true for a product in no discount', () => {
    expect(isTimeDiscountMemberAvailable(baseConfig, 'gid://shopify/Product/4', undefined)).toBe(true)
  })

  it('is true for a member already claimed by the discount being excluded', () => {
    expect(isTimeDiscountMemberAvailable(baseConfig, 'gid://shopify/Product/1', undefined, 'time_disc_1')).toBe(true)
  })
})

describe('computeTimeDiscountStatusLabel', () => {
  const TIME_ZONE = 'UTC'
  const startsAt = '2026-01-01T00:00'
  const endsAt = '2026-01-02T00:00'

  afterEach(() => vi.useRealTimers())

  it('is Upcoming before the start instant', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-12-31T23:59:59.999Z'))
    expect(computeTimeDiscountStatusLabel(startsAt, endsAt, TIME_ZONE)).toBe('Upcoming')
  })

  it('is Active exactly at the start instant (inclusive lower boundary)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    expect(computeTimeDiscountStatusLabel(startsAt, endsAt, TIME_ZONE)).toBe('Active')
  })

  it('is Active just before the end instant', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T23:59:59.999Z'))
    expect(computeTimeDiscountStatusLabel(startsAt, endsAt, TIME_ZONE)).toBe('Active')
  })

  it('is Expired exactly at the end instant (exclusive upper boundary)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'))
    expect(computeTimeDiscountStatusLabel(startsAt, endsAt, TIME_ZONE)).toBe('Expired')
  })

  it('is Expired after the end instant', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-02T00:00:01.000Z'))
    expect(computeTimeDiscountStatusLabel(startsAt, endsAt, TIME_ZONE)).toBe('Expired')
  })
})

describe('fixedPriceNotLowerError', () => {
  it('returns a message naming both prices when a fixed price is not below the regular price', () => {
    expect(fixedPriceNotLowerError('fixed', 25, 20)).toBe('The fixed price (£25.00) is not lower than the regular price (£20.00), so it would not discount anything. Check the price you entered.')
    expect(fixedPriceNotLowerError('fixed', 20, 20)).toContain('is not lower than the regular price (£20.00)')
  })

  it('returns null for a genuinely lower fixed price', () => {
    expect(fixedPriceNotLowerError('fixed', 19.99, 20)).toBeNull()
  })

  it('returns null when it cannot or should not judge: percent mode, no amount yet, or no known regular price', () => {
    expect(fixedPriceNotLowerError('percent', 50, 20)).toBeNull()
    expect(fixedPriceNotLowerError('fixed', 0, 20)).toBeNull()
    expect(fixedPriceNotLowerError('fixed', Number.NaN, 20)).toBeNull()
    expect(fixedPriceNotLowerError('fixed', 25, null)).toBeNull()
    expect(fixedPriceNotLowerError('fixed', 25, undefined)).toBeNull()
    expect(fixedPriceNotLowerError('fixed', 25, 0)).toBeNull()
  })
})
