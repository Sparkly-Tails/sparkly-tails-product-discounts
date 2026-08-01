import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchProducts, getProductInfo, getGroupProductInfo } from '@/lib/products'
import * as shopifyClient from '@/lib/shopify-client'

describe('searchProducts', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns matching products with real ids', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      products: {
        edges: [
          { node: { id: 'gid://shopify/Product/111', title: 'Chicken Voucher' } },
        ],
      },
    })

    const result = await searchProducts('chicken')
    expect(result).toEqual([{ id: 'gid://shopify/Product/111', title: 'Chicken Voucher' }])
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('products(first: 8'), { q: 'chicken' })
  })

  it('returns an empty array without calling shopifyQuery for a blank query', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    expect(await searchProducts('   ')).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('getProductInfo', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns title and base price parsed from the first variant', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      product: {
        title: 'Chicken Voucher',
        variants: { edges: [{ node: { price: '1.70' } }] },
      },
    })

    expect(await getProductInfo('gid://shopify/Product/111')).toEqual({ title: 'Chicken Voucher', basePrice: 1.70 })
  })

  it('returns null when the product does not exist', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ product: null })
    expect(await getProductInfo('gid://shopify/Product/999')).toBeNull()
  })

  it('returns null when the product has no variants', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      product: { title: 'Empty Product', variants: { edges: [] } },
    })
    expect(await getProductInfo('gid://shopify/Product/222')).toBeNull()
  })
})

describe('getGroupProductInfo', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns title, price, and handle for each product', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      nodes: [
        {
          id: 'gid://shopify/Product/1',
          title: 'Tuna Soup',
          handle: 'tuna-soup',
          variants: { edges: [{ node: { price: '1.49' } }] },
        },
        {
          id: 'gid://shopify/Product/2',
          title: 'Chicken Soup',
          handle: 'chicken-soup',
          variants: { edges: [{ node: { price: '1.49' } }] },
        },
      ],
    })

    const result = await getGroupProductInfo(['gid://shopify/Product/1', 'gid://shopify/Product/2'])
    expect(result).toEqual([
      { productId: 'gid://shopify/Product/1', title: 'Tuna Soup', handle: 'tuna-soup', basePrice: 1.49 },
      { productId: 'gid://shopify/Product/2', title: 'Chicken Soup', handle: 'chicken-soup', basePrice: 1.49 },
    ])
  })

  it('skips products that no longer exist or have no variants', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      nodes: [null, { id: 'gid://shopify/Product/2', title: 'No Variant', handle: 'no-variant', variants: { edges: [] } }],
    })
    const result = await getGroupProductInfo(['gid://shopify/Product/999', 'gid://shopify/Product/2'])
    expect(result).toEqual([])
  })

  it('returns an empty array without calling shopifyQuery for an empty id list', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    expect(await getGroupProductInfo([])).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })
})
