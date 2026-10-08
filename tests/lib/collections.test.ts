import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchCollections, resolveCollectionMembers } from '@/lib/collections'
import * as shopifyClient from '@/lib/shopify-client'

describe('searchCollections', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns [] for an empty query without a network call', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    expect(await searchCollections('  ')).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('maps collection search results', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      collections: { edges: [{ node: { id: 'gid://shopify/Collection/1', title: 'Summer Sale' } }] },
    })
    expect(await searchCollections('summer')).toEqual([{ id: 'gid://shopify/Collection/1', title: 'Summer Sale' }])
  })
})

describe('resolveCollectionMembers', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('enumerates products across one collection', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      collection: {
        products: {
          edges: [{ node: { id: 'gid://shopify/Product/1' } }, { node: { id: 'gid://shopify/Product/2' } }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    })
    const result = await resolveCollectionMembers(['gid://shopify/Collection/1'])
    expect(result).toEqual([{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }])
  })

  it('dedupes a product that appears in two chosen collections', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    spy.mockResolvedValueOnce({
      collection: { products: { edges: [{ node: { id: 'gid://shopify/Product/1' } }], pageInfo: { hasNextPage: false, endCursor: null } } },
    })
    spy.mockResolvedValueOnce({
      collection: { products: { edges: [{ node: { id: 'gid://shopify/Product/1' } }, { node: { id: 'gid://shopify/Product/2' } }], pageInfo: { hasNextPage: false, endCursor: null } } },
    })
    const result = await resolveCollectionMembers(['gid://shopify/Collection/1', 'gid://shopify/Collection/2'])
    expect(result).toEqual([{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }])
  })

  it('follows pagination past 250 products in one collection', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    spy.mockResolvedValueOnce({
      collection: { products: { edges: [{ node: { id: 'gid://shopify/Product/1' } }], pageInfo: { hasNextPage: true, endCursor: 'cursor1' } } },
    })
    spy.mockResolvedValueOnce({
      collection: { products: { edges: [{ node: { id: 'gid://shopify/Product/2' } }], pageInfo: { hasNextPage: false, endCursor: null } } },
    })
    const result = await resolveCollectionMembers(['gid://shopify/Collection/1'])
    expect(result).toEqual([{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }])
    expect(spy).toHaveBeenLastCalledWith(expect.any(String), { id: 'gid://shopify/Collection/1', after: 'cursor1' })
  })

  it('skips a collection that no longer resolves instead of throwing', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ collection: null })
    expect(await resolveCollectionMembers(['gid://shopify/Collection/999'])).toEqual([])
  })

  it('stops paging as soon as it has collected the most products it was asked for', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    spy.mockResolvedValueOnce({
      collection: {
        products: {
          edges: [1, 2, 3].map((n) => ({ node: { id: `gid://shopify/Product/${n}` } })),
          pageInfo: { hasNextPage: true, endCursor: 'cursor1' },
        },
      },
    })
    const result = await resolveCollectionMembers(['gid://shopify/Collection/1', 'gid://shopify/Collection/2'], 2)
    expect(result).toEqual([{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }])
    expect(spy).toHaveBeenCalledTimes(1) // neither the next page nor the second collection was fetched
  })
})
