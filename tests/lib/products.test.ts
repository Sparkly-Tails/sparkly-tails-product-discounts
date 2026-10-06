import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchProducts, getProductVariantOptions, getMemberInfo, getLowestVariantPrices } from '@/lib/products'
import * as shopifyClient from '@/lib/shopify-client'

describe('searchProducts', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns no results for a blank query without calling Shopify', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    expect(await searchProducts('   ')).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('returns each product with its variant count', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      products: {
        edges: [
          { node: { id: 'gid://shopify/Product/1', title: 'Tuna Soup', variants: { edges: [{ node: {} }] } } },
          { node: { id: 'gid://shopify/Product/2', title: 'Wet Cat Food', variants: { edges: [{ node: {} }, { node: {} }, { node: {} }] } } },
        ],
      },
    })

    const results = await searchProducts('soup')
    expect(results).toEqual([
      { id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 },
      { id: 'gid://shopify/Product/2', title: 'Wet Cat Food', variantCount: 3 },
    ])
  })
})

describe('getProductVariantOptions', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('lists every variant with its own title and price', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      product: {
        variants: {
          edges: [
            { node: { id: 'gid://shopify/ProductVariant/10', title: 'Chicken', price: '1.49' } },
            { node: { id: 'gid://shopify/ProductVariant/11', title: 'Salmon', price: '1.59' } },
          ],
        },
      },
    })

    const options = await getProductVariantOptions('gid://shopify/Product/2')
    expect(options).toEqual([
      { variantId: 'gid://shopify/ProductVariant/10', title: 'Chicken', price: 1.49 },
      { variantId: 'gid://shopify/ProductVariant/11', title: 'Salmon', price: 1.59 },
    ])
  })

  it('returns an empty array when the product no longer resolves', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ product: null })
    expect(await getProductVariantOptions('gid://shopify/Product/999')).toEqual([])
  })
})

describe('getMemberInfo', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns an empty array without a network call for no members', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    expect(await getMemberInfo([])).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('resolves a whole-product member to its own single variant', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      nodes: [
        {
          id: 'gid://shopify/Product/1', title: 'Tuna Soup', handle: 'tuna-soup', featuredImage: { url: 'https://x/tuna.png' },
          variants: { edges: [{ node: { id: 'gid://shopify/ProductVariant/10', title: 'Default Title', price: '1.49' } }] },
        },
      ],
    })

    const info = await getMemberInfo([{ productId: 'gid://shopify/Product/1' }])
    expect(info).toEqual([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'Tuna Soup', price: 1.49, handle: 'tuna-soup', imageUrl: 'https://x/tuna.png' },
    ])
  })

  it('resolves a variant-scoped member to "Product – Variant" title and that variant\'s own price', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      nodes: [
        {
          id: 'gid://shopify/Product/2', title: 'Wet Cat Food', handle: 'wet-cat-food', featuredImage: null,
          variants: {
            edges: [
              { node: { id: 'gid://shopify/ProductVariant/20', title: 'Chicken', price: '1.49' } },
              { node: { id: 'gid://shopify/ProductVariant/21', title: 'Salmon', price: '1.59' } },
            ],
          },
        },
      ],
    })

    const info = await getMemberInfo([{ productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/21' }])
    expect(info).toEqual([
      { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/21', title: 'Wet Cat Food – Salmon', price: 1.59, handle: 'wet-cat-food', imageUrl: null },
    ])
  })

  it('silently skips a member whose product no longer resolves', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ nodes: [null] })
    expect(await getMemberInfo([{ productId: 'gid://shopify/Product/999' }])).toEqual([])
  })

  it('batches nodes(ids:) lookups in chunks of 250 (Shopify\'s list-argument cap) and merges/dedupes the results', async () => {
    const memberCount = 300
    const members = Array.from({ length: memberCount }, (_, i) => ({ productId: `gid://shopify/Product/${i}` }))

    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockImplementation(async (_query, variables) => {
      const ids = (variables as { ids: string[] }).ids
      return {
        nodes: ids.map((id) => ({
          id,
          title: `Product ${id}`,
          handle: id,
          featuredImage: null,
          variants: { edges: [{ node: { id: `${id}-variant`, title: 'Default Title', price: '1.00' } }] },
        })),
      }
    })

    const info = await getMemberInfo(members)

    expect(spy).toHaveBeenCalledTimes(2)
    for (const call of spy.mock.calls) {
      const ids = (call[1] as { ids: string[] }).ids
      expect(ids.length).toBeLessThanOrEqual(250)
    }
    expect(info).toHaveLength(memberCount)
    expect(new Set(info.map((m) => m.productId)).size).toBe(memberCount)
  })
})

describe('getLowestVariantPrices', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns each product\'s lowest variant price with its title', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      nodes: [
        { id: 'gid://shopify/Product/1', title: 'Cat Bed', variants: { edges: [{ node: { price: '30.00' } }, { node: { price: '24.50' } }, { node: { price: '40.00' } }] } },
        { id: 'gid://shopify/Product/2', title: 'Toy', variants: { edges: [{ node: { price: '5.00' } }] } },
      ],
    })
    expect(await getLowestVariantPrices(['gid://shopify/Product/1', 'gid://shopify/Product/2'])).toEqual([
      { productId: 'gid://shopify/Product/1', title: 'Cat Bed', price: 24.5 },
      { productId: 'gid://shopify/Product/2', title: 'Toy', price: 5 },
    ])
  })

  it('skips a product that no longer resolves or has no variants, and makes no call for an empty list', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      nodes: [null, { id: 'gid://shopify/Product/3', title: 'Empty', variants: { edges: [] } }],
    })
    expect(await getLowestVariantPrices(['gid://shopify/Product/9', 'gid://shopify/Product/3'])).toEqual([])
    spy.mockClear()
    expect(await getLowestVariantPrices([])).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('asks for each product once, in chunks of at most 250', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ nodes: [] })
    const ids = Array.from({ length: 300 }, (_, i) => `gid://shopify/Product/${i}`)
    await getLowestVariantPrices([...ids, ids[0]])
    expect(spy).toHaveBeenCalledTimes(2)
    expect((spy.mock.calls[0][1] as { ids: string[] }).ids).toHaveLength(250)
    expect((spy.mock.calls[1][1] as { ids: string[] }).ids).toHaveLength(50)
  })
})
