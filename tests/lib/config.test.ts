import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getConfig, saveConfig, isProductAvailable, type Config } from '@/lib/config'
import * as shopifyClient from '@/lib/shopify-client'

describe('getConfig', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('parses the stored config JSON', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      shop: { metafield: { value: JSON.stringify({ products: [{ productId: 'gid://shopify/Product/1', status: 'live', tiers: [{ minQty: 5, percentOff: 10 }] }] }) } },
    })

    const config = await getConfig()
    expect(config).toEqual({
      products: [{ productId: 'gid://shopify/Product/1', status: 'live', pricingMode: 'percent', tiers: [{ minQty: 5, percentOff: 10 }] }],
      groups: [],
    })
  })

  it('returns an empty product list when no metafield exists yet', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ shop: { metafield: null } })

    const config = await getConfig()
    expect(config).toEqual({ products: [], groups: [] })
  })

  it('defaults groups to [] when the stored config predates the groups field', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      shop: { metafield: { value: JSON.stringify({ products: [] }) } },
    })
    const config = await getConfig()
    expect(config).toEqual({ products: [], groups: [] })
  })

  it('parses a stored config that includes groups', async () => {
    const stored = {
      products: [],
      groups: [
        {
          groupId: 'grp_1',
          name: 'Soups',
          status: 'live',
          productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'],
          tiers: [{ minQty: 7, percentOff: 10 }],
        },
      ],
    }
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      shop: { metafield: { value: JSON.stringify(stored) } },
    })
    const config = await getConfig()
    expect(config).toEqual({
      products: [],
      groups: [{ ...stored.groups[0], pricingMode: 'percent' }],
    })
  })

  it('defaults pricingMode to percent for a product discount stored before this field existed', async () => {
    const stored = {
      products: [{ productId: 'gid://shopify/Product/1', status: 'live', tiers: [{ minQty: 5, percentOff: 10 }] }],
      groups: [],
    }
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      shop: { metafield: { value: JSON.stringify(stored) } },
    })
    const config = await getConfig()
    expect(config.products[0].pricingMode).toBe('percent')
  })

  it('defaults pricingMode to percent for a group discount stored before this field existed', async () => {
    const stored = {
      products: [],
      groups: [{ groupId: 'grp_1', name: 'Soups', status: 'live', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [{ minQty: 7, percentOff: 10 }] }],
    }
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      shop: { metafield: { value: JSON.stringify(stored) } },
    })
    const config = await getConfig()
    expect(config.groups[0].pricingMode).toBe('percent')
  })

  it('preserves an explicit pricingMode of fixed', async () => {
    const stored = {
      products: [{ productId: 'gid://shopify/Product/1', status: 'live', pricingMode: 'fixed', tiers: [{ minQty: 1, fixedPrice: 1.70 }, { minQty: 3, fixedPrice: 1.50 }] }],
      groups: [],
    }
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      shop: { metafield: { value: JSON.stringify(stored) } },
    })
    const config = await getConfig()
    expect(config.products[0]).toEqual(stored.products[0])
  })
})

describe('saveConfig', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('writes the config as a JSON shop metafield', async () => {
    const shopIdSpy = vi.spyOn(shopifyClient, 'shopifyQuery')
    shopIdSpy.mockResolvedValueOnce({ shop: { id: 'gid://shopify/Shop/1' } })
    shopIdSpy.mockResolvedValueOnce({ metafieldsSet: { userErrors: [] } })

    const config: Config = { products: [{ productId: 'gid://shopify/Product/1', status: 'draft', pricingMode: 'percent', tiers: [] }], groups: [] }
    await saveConfig(config)

    expect(shopIdSpy).toHaveBeenCalledTimes(2)
    expect(shopIdSpy).toHaveBeenLastCalledWith(
      expect.stringContaining('metafieldsSet'),
      expect.objectContaining({
        metafields: [
          expect.objectContaining({
            ownerId: 'gid://shopify/Shop/1',
            namespace: 'sparkly_product_discounts',
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

    await expect(saveConfig({ products: [], groups: [] })).rejects.toThrow('Invalid JSON')
  })
})

describe('isProductAvailable', () => {
  const baseConfig: Config = {
    products: [{ productId: 'gid://shopify/Product/1', status: 'draft', pricingMode: 'percent', tiers: [] }],
    groups: [
      { groupId: 'grp_a', name: 'A', status: 'draft', pricingMode: 'percent', productIds: ['gid://shopify/Product/2'], tiers: [] },
    ],
  }

  it('is false for a product already in a standalone discount', () => {
    expect(isProductAvailable(baseConfig, 'gid://shopify/Product/1')).toBe(false)
  })

  it('is false for a product already in another group', () => {
    expect(isProductAvailable(baseConfig, 'gid://shopify/Product/2')).toBe(false)
  })

  it('is true for a product in neither', () => {
    expect(isProductAvailable(baseConfig, 'gid://shopify/Product/3')).toBe(true)
  })

  it('is true for a product already in the group being excluded', () => {
    expect(isProductAvailable(baseConfig, 'gid://shopify/Product/2', 'grp_a')).toBe(true)
  })

  it('is still false for a product in a different, non-excluded group', () => {
    expect(isProductAvailable(baseConfig, 'gid://shopify/Product/2', 'grp_other')).toBe(false)
  })
})
