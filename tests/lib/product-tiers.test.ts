import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncProductTierMetafield, syncGroupTierMetafield } from '@/lib/product-tiers'
import * as shopifyClient from '@/lib/shopify-client'

describe('syncProductTierMetafield', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('writes the tiers JSON to the product metafield', async () => {
    const querySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsSet: { userErrors: [] },
    })

    await syncProductTierMetafield('gid://shopify/Product/1', [{ minQty: 7, percentOff: 5 }], 'Chicken Soup')

    expect(querySpy).toHaveBeenCalledWith(
      expect.stringContaining('metafieldsSet'),
      {
        metafields: [
          {
            ownerId: 'gid://shopify/Product/1',
            namespace: 'sparkly_product_discounts',
            key: 'tiers',
            type: 'json',
            value: JSON.stringify({ title: 'Chicken Soup', tiers: [{ minQty: 7, percentOff: 5 }] }),
          },
        ],
      },
    )
  })

  it('deletes the metafield when tiers is null', async () => {
    const querySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsDelete: { userErrors: [] },
    })

    await syncProductTierMetafield('gid://shopify/Product/1', null, 'Chicken Soup')

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
      syncProductTierMetafield('gid://shopify/Product/1', [{ minQty: 5, percentOff: 10 }], 'Chicken Soup'),
    ).rejects.toThrow('Invalid JSON')
  })

  it('throws when metafieldsDelete reports userErrors', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsDelete: { userErrors: [{ field: ['metafields'], message: 'Not found' }] },
    })

    await expect(syncProductTierMetafield('gid://shopify/Product/1', null, 'Chicken Soup')).rejects.toThrow('Not found')
  })

  it('includes the title in the synced tiers metafield JSON', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsSet: { userErrors: [] },
    })

    await syncProductTierMetafield('gid://shopify/Product/1', [{ minQty: 5, percentOff: 10 }], 'Canagan Tuna Soup')

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('metafieldsSet'),
      expect.objectContaining({
        metafields: [
          expect.objectContaining({
            value: JSON.stringify({ title: 'Canagan Tuna Soup', tiers: [{ minQty: 5, percentOff: 10 }] }),
          }),
        ],
      }),
    )
  })
})

describe('syncGroupTierMetafield', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('writes the group tiers + siblings JSON to the product metafield', async () => {
    const querySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsSet: { userErrors: [] },
    })

    await syncGroupTierMetafield('gid://shopify/Product/1', {
      title: 'Canagan treat',
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
              title: 'Canagan treat',
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
      syncGroupTierMetafield('gid://shopify/Product/1', { title: 'Canagan treat', tiers: [], siblings: [] }),
    ).rejects.toThrow('Invalid JSON')
  })

  it('includes the title in the synced group metafield JSON', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      metafieldsSet: { userErrors: [] },
    })

    await syncGroupTierMetafield('gid://shopify/Product/1', {
      title: 'Canagan treat',
      tiers: [{ minQty: 7, percentOff: 10 }],
      siblings: [{ title: 'Canagan Duck Pouch', handle: 'canagan-duck-pouch' }],
    })

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('metafieldsSet'),
      expect.objectContaining({
        metafields: [
          expect.objectContaining({
            value: JSON.stringify({
              title: 'Canagan treat',
              tiers: [{ minQty: 7, percentOff: 10 }],
              siblings: [{ title: 'Canagan Duck Pouch', handle: 'canagan-duck-pouch' }],
            }),
          }),
        ],
      }),
    )
  })
})
