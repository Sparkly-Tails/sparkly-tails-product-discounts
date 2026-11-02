import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getConfig, saveConfig, isProductAvailable, pricesUniform, type Config } from '@/lib/config'
import * as shopifyClient from '@/lib/shopify-client'
import { METAFIELD_NAMESPACE, METAFIELD_KEYS } from '@/lib/metafieldNames'
import { refreshLiveProductsSafely } from '@/metrics/refreshSettings'

vi.mock('@/metrics/refreshSettings', async (original) => ({ ...(await original<typeof import('@/metrics/refreshSettings')>()), refreshLiveProductsSafely: vi.fn(async () => {}) }))

describe('getConfig', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('parses the stored config JSON', async () => {
    const stored = {
      discounts: [
        {
          discountId: 'disc_1',
          name: 'Tuna Soup',
          title: 'Canagan Tuna Soup',
          status: 'live',
          pricingMode: 'percent',
          members: [{ productId: 'gid://shopify/Product/1' }],
          tiers: [{ minQty: 5, percentOff: 10 }],
        },
      ],
    }
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      shop: { metafield: { value: JSON.stringify(stored) } },
    })

    const config = await getConfig()
    expect(config).toEqual(stored)
  })

  it('reads tier_config in the app namespace', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ shop: { metafield: null } })

    await getConfig()
    expect(spy).toHaveBeenCalledWith(expect.any(String), { namespace: METAFIELD_NAMESPACE, key: METAFIELD_KEYS.tierConfig })
  })

  it('returns an empty discount list when no metafield exists yet', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ shop: { metafield: null } })

    const config = await getConfig()
    expect(config).toEqual({ discounts: [] })
  })

  it('returns an empty discount list when the stored config predates the discounts field (old products/groups shape)', async () => {
    const oldShape = { products: [], groups: [] }
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      shop: { metafield: { value: JSON.stringify(oldShape) } },
    })

    const config = await getConfig()
    expect(config).toEqual({ discounts: [] })
  })
})

describe('saveConfig', () => {
  beforeEach(() => { vi.restoreAllMocks(); vi.mocked(refreshLiveProductsSafely).mockClear() })

  it('writes the config as a JSON shop metafield', async () => {
    const shopIdSpy = vi.spyOn(shopifyClient, 'shopifyQuery')
    shopIdSpy.mockResolvedValueOnce({ shop: { id: 'gid://shopify/Shop/1' } })
    shopIdSpy.mockResolvedValueOnce({ metafieldsSet: { userErrors: [] } })

    const config: Config = {
      discounts: [
        {
          discountId: 'disc_1', name: 'Tuna Soup', title: 'Some Title', status: 'draft',
          pricingMode: 'percent', members: [{ productId: 'gid://shopify/Product/1' }], tiers: [],
        },
      ],
    }
    await saveConfig(config)

    expect(shopIdSpy).toHaveBeenCalledTimes(2)
    expect(shopIdSpy).toHaveBeenLastCalledWith(
      expect.stringContaining('metafieldsSet'),
      expect.objectContaining({
        metafields: [
          expect.objectContaining({
            ownerId: 'gid://shopify/Shop/1',
            namespace: METAFIELD_NAMESPACE,
            key: METAFIELD_KEYS.tierConfig,
            type: 'json',
            value: JSON.stringify(config),
          }),
          expect.objectContaining({
            ownerId: 'gid://shopify/Shop/1',
            namespace: METAFIELD_NAMESPACE,
            key: METAFIELD_KEYS.cardIndex,
            type: 'json',
            value: JSON.stringify({ discounts: [] }),
          }),
        ],
      }),
    )
  })

  it('refreshes the products-in-live-discounts copy that the visit counter reads, after the config is saved', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    spy.mockResolvedValueOnce({ shop: { id: 'gid://shopify/Shop/1' } })
    spy.mockResolvedValueOnce({ nodes: [{ id: 'gid://shopify/Product/1', handle: 'tuna' }] })
    spy.mockResolvedValueOnce({ metafieldsSet: { userErrors: [] } })
    const config: Config = { discounts: [{ discountId: 'disc_1', name: 'Tuna', title: '', status: 'live', pricingMode: 'percent', members: [{ productId: 'gid://shopify/Product/1' }], tiers: [] }] }
    await saveConfig(config)
    expect(refreshLiveProductsSafely).toHaveBeenCalledTimes(1)
    expect(vi.mocked(refreshLiveProductsSafely).mock.calls[0][0].discounts).toEqual(config.discounts)
  })

  it('does not refresh the copy when Shopify refuses the save', async () => {
    vi.mocked(refreshLiveProductsSafely).mockClear()
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    spy.mockResolvedValueOnce({ shop: { id: 'gid://shopify/Shop/1' } })
    spy.mockResolvedValueOnce({ nodes: [] })
    spy.mockResolvedValueOnce({ metafieldsSet: { userErrors: [{ field: [], message: 'no' }] } })
    await expect(saveConfig({ discounts: [] })).rejects.toThrow('no')
    expect(refreshLiveProductsSafely).not.toHaveBeenCalled()
  })

  it('writes the live discounts as the product card index in the same call, so the two never differ', async () => {
    const shopIdSpy = vi.spyOn(shopifyClient, 'shopifyQuery')
    shopIdSpy.mockResolvedValueOnce({ shop: { id: 'gid://shopify/Shop/1' } })
    shopIdSpy.mockResolvedValueOnce({ nodes: [{ id: 'gid://shopify/Product/7', handle: 'tuna-soup' }] })
    shopIdSpy.mockResolvedValueOnce({ metafieldsSet: { userErrors: [] } })

    await saveConfig({
      discounts: [
        { discountId: 'a', name: 'A', title: 'A', status: 'live', pricingMode: 'percent', members: [{ productId: 'gid://shopify/Product/7' }], tiers: [{ minQty: 3, percentOff: 10 }] },
        { discountId: 'b', name: 'B', title: 'B', status: 'draft', pricingMode: 'percent', members: [{ productId: 'gid://shopify/Product/8' }], tiers: [{ minQty: 2, percentOff: 5 }] },
      ],
    })

    const [, variables] = shopIdSpy.mock.calls[2] as [string, { metafields: { key: string; value: string }[] }]
    const written = variables.metafields.find((metafield) => metafield.key === METAFIELD_KEYS.cardIndex)
    expect(JSON.parse(written!.value)).toEqual({ discounts: [{ tiers: [{ minQty: 3, percentOff: 10 }], members: [{ productId: '7', handle: 'tuna-soup', variantIds: null }], flash: null }] })
    expect(shopIdSpy).toHaveBeenCalledTimes(3)
  })

  it('throws when Shopify reports userErrors', async () => {
    const shopIdSpy = vi.spyOn(shopifyClient, 'shopifyQuery')
    shopIdSpy.mockResolvedValueOnce({ shop: { id: 'gid://shopify/Shop/1' } })
    shopIdSpy.mockResolvedValueOnce({ metafieldsSet: { userErrors: [{ field: ['value'], message: 'Invalid JSON' }] } })

    await expect(saveConfig({ discounts: [] })).rejects.toThrow('Invalid JSON')
  })
})

describe('isProductAvailable', () => {
  const baseConfig: Config = {
    discounts: [
      {
        discountId: 'disc_1', name: 'Solo', title: 'Solo', status: 'draft', pricingMode: 'percent',
        members: [{ productId: 'gid://shopify/Product/1' }],
        tiers: [],
      },
      {
        discountId: 'disc_2', name: 'Flavours', title: 'Flavours', status: 'draft', pricingMode: 'percent',
        members: [
          { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20' },
          { productId: 'gid://shopify/Product/3' },
        ],
        tiers: [],
      },
    ],
  }

  it('is false for a whole product already claimed by another discount', () => {
    expect(isProductAvailable(baseConfig, 'gid://shopify/Product/1', undefined)).toBe(false)
  })

  it('is false for a product already claimed as a whole-product member', () => {
    expect(isProductAvailable(baseConfig, 'gid://shopify/Product/3', undefined)).toBe(false)
  })

  it('is false for the exact same variant already claimed', () => {
    expect(isProductAvailable(baseConfig, 'gid://shopify/Product/2', 'gid://shopify/ProductVariant/20')).toBe(false)
  })

  it('is true for a different variant of a product that only has one specific variant claimed', () => {
    expect(isProductAvailable(baseConfig, 'gid://shopify/Product/2', 'gid://shopify/ProductVariant/21')).toBe(true)
  })

  it('is true for a product in no discount', () => {
    expect(isProductAvailable(baseConfig, 'gid://shopify/Product/4', undefined)).toBe(true)
  })

  it('is true for a member already claimed by the discount being excluded', () => {
    expect(isProductAvailable(baseConfig, 'gid://shopify/Product/1', undefined, 'disc_1')).toBe(true)
  })
})

describe('pricesUniform', () => {
  it('is true for zero or one price', () => {
    expect(pricesUniform([])).toBe(true)
    expect(pricesUniform([1.49])).toBe(true)
  })

  it('is true when all prices match exactly', () => {
    expect(pricesUniform([1.49, 1.49, 1.49])).toBe(true)
  })

  it('is true when prices match within floating-point tolerance', () => {
    expect(pricesUniform([1.1 + 0.39, 1.49])).toBe(true)
  })

  it('is false when any price differs', () => {
    expect(pricesUniform([1.49, 1.59])).toBe(false)
  })
})

describe('getConfig keeps the flash sale fields of a discount', () => {
  it('returns flash and highDemand as stored', async () => {
    const stored = { discounts: [{ discountId: 'd1', name: 'N', title: 'T', status: 'live', pricingMode: 'percent', members: [], tiers: [], flash: { startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', showTeaser: true, shopifyDiscountId: 'gid://shopify/DiscountAutomaticNode/1' }, highDemand: true }] }
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ shop: { metafield: { value: JSON.stringify(stored) } } })
    const config = await getConfig()
    expect(config.discounts[0].flash).toEqual(stored.discounts[0].flash)
    expect(config.discounts[0].highDemand).toBe(true)
  })

  it('leaves both fields undefined for an older discount', async () => {
    const stored = { discounts: [{ discountId: 'd1', name: 'N', title: 'T', status: 'live', pricingMode: 'percent', members: [], tiers: [] }] }
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ shop: { metafield: { value: JSON.stringify(stored) } } })
    const config = await getConfig()
    expect(config.discounts[0].flash).toBeUndefined()
    expect(config.discounts[0].highDemand).toBeUndefined()
  })
})
