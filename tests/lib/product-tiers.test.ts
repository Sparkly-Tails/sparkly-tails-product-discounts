import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncDiscountMetafields, clearDiscountMetafields } from '@/lib/product-tiers'
import * as shopifyClient from '@/lib/shopify-client'
import * as products from '@/lib/products'
import type { Discount } from '@/lib/config'

describe('syncDiscountMetafields', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('writes one metafield per unique product, with ownVariantIds and per-member siblings', async () => {
    vi.spyOn(products, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'Tuna Soup', price: 1.49, handle: 'tuna-soup', imageUrl: null },
      { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20', title: 'Wet Cat Food – Chicken', price: 1.49, handle: 'wet-cat-food', imageUrl: 'https://x/c.png' },
      { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/21', title: 'Wet Cat Food – Salmon', price: 1.49, handle: 'wet-cat-food', imageUrl: 'https://x/s.png' },
    ])
    const querySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsSet: { userErrors: [] } })

    const discount: Discount = {
      discountId: 'disc_1', name: 'Mix', title: 'Mix & Match', status: 'live', pricingMode: 'percent',
      members: [
        { productId: 'gid://shopify/Product/1' },
        { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20' },
        { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/21' },
      ],
      tiers: [{ minQty: 7, percentOff: 4 }],
    }

    await syncDiscountMetafields(discount)

    expect(querySpy).toHaveBeenCalledTimes(2)

    const call1 = querySpy.mock.calls.find((c) => (c[1] as { metafields: { ownerId: string }[] }).metafields[0].ownerId === 'gid://shopify/Product/1')!
    const parsed1 = JSON.parse((call1[1] as { metafields: { value: string }[] }).metafields[0].value)
    expect(parsed1).toEqual({
      discountId: 'disc_1',
      title: 'Mix & Match',
      pricingMode: 'percent',
      tiers: [{ minQty: 7, percentOff: 4 }],
      ownVariantIds: null,
      siblings: [
        { productId: 'gid://shopify/Product/2', title: 'Wet Cat Food – Chicken', handle: 'wet-cat-food', variantId: 'gid://shopify/ProductVariant/20', imageUrl: 'https://x/c.png' },
        { productId: 'gid://shopify/Product/2', title: 'Wet Cat Food – Salmon', handle: 'wet-cat-food', variantId: 'gid://shopify/ProductVariant/21', imageUrl: 'https://x/s.png' },
      ],
    })

    const call2 = querySpy.mock.calls.find((c) => (c[1] as { metafields: { ownerId: string }[] }).metafields[0].ownerId === 'gid://shopify/Product/2')!
    const parsed2 = JSON.parse((call2[1] as { metafields: { value: string }[] }).metafields[0].value)
    expect(parsed2.ownVariantIds).toEqual(['gid://shopify/ProductVariant/20', 'gid://shopify/ProductVariant/21'])
    expect(parsed2.siblings).toEqual([
      { productId: 'gid://shopify/Product/1', title: 'Tuna Soup', handle: 'tuna-soup', variantId: undefined, imageUrl: null },
    ])
  })
})

describe('clearDiscountMetafields', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('deletes the discount metafield for every unique product', async () => {
    const querySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsDelete: { userErrors: [] } })

    await clearDiscountMetafields([
      { productId: 'gid://shopify/Product/1' },
      { productId: 'gid://shopify/Product/2' },
      { productId: 'gid://shopify/Product/2' },
    ])

    expect(querySpy).toHaveBeenCalledTimes(2)
  })
})
