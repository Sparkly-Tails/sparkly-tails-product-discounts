import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchProducts, getProductVariantOptions, getMemberInfo } from '@/lib/products'
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
})
