import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getTimeDiscountsConfig, saveTimeDiscountsConfig, isTimeDiscountMemberAvailable, pricesUniform,
  computeTimeDiscountStatusLabel, type TimeDiscountsConfig,
} from '@/timeDiscounts/config'
import * as shopifyClient from '@/lib/shopify-client'

describe('getTimeDiscountsConfig', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('parses the stored config JSON', async () => {
    const stored: TimeDiscountsConfig = {
      discounts: [
        {
          discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'Flash Sale', title: 'Flash Sale',
          pricingMode: 'percent', amount: 20, startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
          selection: { mode: 'products', members: [{ productId: 'gid://shopify/Product/1' }] },
          resolvedMembers: [{ productId: 'gid://shopify/Product/1' }],
        },
      ],
    }
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ shop: { metafield: { value: JSON.stringify(stored) } } })

    const config = await getTimeDiscountsConfig()
    expect(config).toEqual(stored)
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
        discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'X', title: 'X', pricingMode: 'percent', amount: 10,
        startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
        selection: { mode: 'products', members: [{ productId: 'gid://shopify/Product/1' }] },
        resolvedMembers: [{ productId: 'gid://shopify/Product/1' }],
      },
      {
        discountId: 'time_disc_2', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/2', name: 'Y', title: 'Y', pricingMode: 'percent', amount: 10,
        startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
        selection: { mode: 'collections', collectionIds: ['gid://shopify/Collection/1'] },
        resolvedMembers: [
          { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20' },
          { productId: 'gid://shopify/Product/3' },
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

describe('pricesUniform', () => {
  it('is true for zero or one price', () => {
    expect(pricesUniform([])).toBe(true)
    expect(pricesUniform([1.49])).toBe(true)
  })

  it('is true when prices match within floating-point tolerance', () => {
    expect(pricesUniform([1.1 + 0.39, 1.49])).toBe(true)
  })

  it('is false when any price differs', () => {
    expect(pricesUniform([1.49, 1.59])).toBe(false)
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
