import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getConfig, saveConfig, isProductAvailable, pricesUniform, type Config } from '@/lib/config'
import * as shopifyClient from '@/lib/shopify-client'

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
  beforeEach(() => vi.restoreAllMocks())

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
