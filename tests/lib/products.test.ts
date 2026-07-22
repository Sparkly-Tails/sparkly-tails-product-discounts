import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchProducts, getProductInfo } from '@/lib/products'
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
