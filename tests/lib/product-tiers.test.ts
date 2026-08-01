import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncProductTierMetafield, syncGroupTierMetafield } from '@/lib/product-tiers'
import * as shopifyClient from '@/lib/shopify-client'

describe('syncProductTierMetafield', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('writes the tiers JSON to the product metafield', async () => {
    const querySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsSet: { userErrors: [] },
    })

    await syncProductTierMetafield('gid://shopify/Product/1', [{ minQty: 7, percentOff: 5 }])

    expect(querySpy).toHaveBeenCalledWith(
      expect.stringContaining('metafieldsSet'),
      {
        metafields: [
          {
            ownerId: 'gid://shopify/Product/1',
            namespace: 'sparkly_product_discounts',
            key: 'tiers',
            type: 'json',
            value: JSON.stringify({ tiers: [{ minQty: 7, percentOff: 5 }] }),
          },
        ],
      },
    )
  })

  it('deletes the metafield when tiers is null', async () => {
    const querySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsDelete: { userErrors: [] },
    })

    await syncProductTierMetafield('gid://shopify/Product/1', null)

    expect(querySpy).toHaveBeenCalledWith(
      expect.stringContaining('metafieldsDelete'),
      {
        metafields: [
          {
            ownerId: 'gid://shopify/Product/1',
            namespace: 'sparkly_product_discounts',
            key: 'tiers',
          },
        ],
      },
    )
  })

  it('throws when metafieldsSet reports userErrors', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsSet: { userErrors: [{ field: ['value'], message: 'Invalid JSON' }] },
    })

    await expect(
      syncProductTierMetafield('gid://shopify/Product/1', [{ minQty: 5, percentOff: 10 }]),
    ).rejects.toThrow('Invalid JSON')
  })

  it('throws when metafieldsDelete reports userErrors', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsDelete: { userErrors: [{ field: ['metafields'], message: 'Not found' }] },
    })

    await expect(syncProductTierMetafield('gid://shopify/Product/1', null)).rejects.toThrow('Not found')
  })
})

describe('syncGroupTierMetafield', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('writes the group tiers + siblings JSON to the product metafield', async () => {
    const querySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsSet: { userErrors: [] },
    })

    await syncGroupTierMetafield('gid://shopify/Product/1', {
      tiers: [{ minQty: 7, percentOff: 10 }],
      siblings: [{ title: 'Chicken Soup', handle: 'chicken-soup' }],
    })

    expect(querySpy).toHaveBeenCalledWith(
      expect.stringContaining('metafieldsSet'),
      {
        metafields: [
          {
            ownerId: 'gid://shopify/Product/1',
            namespace: 'sparkly_product_discounts',
            key: 'group',
            type: 'json',
            value: JSON.stringify({
              tiers: [{ minQty: 7, percentOff: 10 }],
              siblings: [{ title: 'Chicken Soup', handle: 'chicken-soup' }],
            }),
          },
        ],
      },
    )
  })

  it('deletes the metafield when data is null', async () => {
    const querySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsDelete: { userErrors: [] },
    })

    await syncGroupTierMetafield('gid://shopify/Product/1', null)

    expect(querySpy).toHaveBeenCalledWith(
      expect.stringContaining('metafieldsDelete'),
      {
        metafields: [
          { ownerId: 'gid://shopify/Product/1', namespace: 'sparkly_product_discounts', key: 'group' },
        ],
      },
    )
  })

  it('throws when metafieldsSet reports userErrors', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsSet: { userErrors: [{ field: ['value'], message: 'Invalid JSON' }] },
    })

    await expect(
      syncGroupTierMetafield('gid://shopify/Product/1', { tiers: [], siblings: [] }),
    ).rejects.toThrow('Invalid JSON')
  })
})
