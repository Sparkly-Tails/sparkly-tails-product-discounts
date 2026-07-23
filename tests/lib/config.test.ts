import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getConfig, saveConfig, type Config } from '@/lib/config'
import * as shopifyClient from '@/lib/shopify-client'

describe('getConfig', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('parses the stored config JSON', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      shop: { metafield: { value: JSON.stringify({ products: [{ productId: 'gid://shopify/Product/1', status: 'live', tiers: [{ minQty: 5, percentOff: 10 }] }] }) } },
    })

    const config = await getConfig()
    expect(config).toEqual({
      products: [{ productId: 'gid://shopify/Product/1', status: 'live', tiers: [{ minQty: 5, percentOff: 10 }] }],
    })
  })

  it('returns an empty product list when no metafield exists yet', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ shop: { metafield: null } })

    const config = await getConfig()
    expect(config).toEqual({ products: [] })
  })
})

describe('saveConfig', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('writes the config as a JSON shop metafield', async () => {
    const shopIdSpy = vi.spyOn(shopifyClient, 'shopifyQuery')
    shopIdSpy.mockResolvedValueOnce({ shop: { id: 'gid://shopify/Shop/1' } })
    shopIdSpy.mockResolvedValueOnce({ metafieldsSet: { userErrors: [] } })

    const config: Config = { products: [{ productId: 'gid://shopify/Product/1', status: 'draft', tiers: [] }] }
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

    await expect(saveConfig({ products: [] })).rejects.toThrow('Invalid JSON')
  })
})
