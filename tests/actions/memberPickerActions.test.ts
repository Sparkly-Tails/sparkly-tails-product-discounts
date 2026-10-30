import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchProductsAction, listProductsAction, getProductVariantsAction, validateMemberAction } from '@/actions/memberPickerActions'
import * as products from '@/lib/products'
import * as configLib from '@/lib/config'

describe('searchProductsAction', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns [] instead of throwing when the search fails', async () => {
    vi.spyOn(products, 'searchProducts').mockRejectedValue(new Error('boom'))
    expect(await searchProductsAction('tuna')).toEqual([])
  })

  it('passes through a single-variant result that belongs to no discount', async () => {
    vi.spyOn(products, 'searchProducts').mockResolvedValue([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1, imageUrl: null }])
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })
    expect(await searchProductsAction('tuna')).toEqual([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1, imageUrl: null }])
  })

  it('drops a single-variant result already claimed by another discount', async () => {
    vi.spyOn(products, 'searchProducts').mockResolvedValue([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1, imageUrl: null }])
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      discounts: [{ discountId: 'disc_x', name: 'X', title: 'X', status: 'live', pricingMode: 'percent', members: [{ productId: 'gid://shopify/Product/1' }], tiers: [] }],
    })
    expect(await searchProductsAction('tuna')).toEqual([])
  })

  it('keeps a single-variant result claimed only by the discount being edited', async () => {
    vi.spyOn(products, 'searchProducts').mockResolvedValue([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1, imageUrl: null }])
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      discounts: [{ discountId: 'disc_1', name: 'X', title: 'X', status: 'live', pricingMode: 'percent', members: [{ productId: 'gid://shopify/Product/1' }], tiers: [] }],
    })
    expect(await searchProductsAction('tuna', 'disc_1')).toEqual([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1, imageUrl: null }])
  })

  it('drops a multi-variant result once every one of its variants is claimed by another discount', async () => {
    vi.spyOn(products, 'searchProducts').mockResolvedValue([{ id: 'gid://shopify/Product/2', title: 'Wet Cat Food', variantCount: 2, imageUrl: null }])
    vi.spyOn(products, 'getProductVariantOptions').mockResolvedValue([
      { variantId: 'gid://shopify/ProductVariant/20', title: 'Chicken', price: 1.49 },
      { variantId: 'gid://shopify/ProductVariant/21', title: 'Salmon', price: 1.49 },
    ])
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      discounts: [{
        discountId: 'disc_x', name: 'X', title: 'X', status: 'live', pricingMode: 'percent',
        members: [
          { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20' },
          { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/21' },
        ],
        tiers: [],
      }],
    })
    expect(await searchProductsAction('cat')).toEqual([])
  })

  it('keeps a multi-variant result when at least one of its variants is still free', async () => {
    vi.spyOn(products, 'searchProducts').mockResolvedValue([{ id: 'gid://shopify/Product/2', title: 'Wet Cat Food', variantCount: 2, imageUrl: null }])
    vi.spyOn(products, 'getProductVariantOptions').mockResolvedValue([
      { variantId: 'gid://shopify/ProductVariant/20', title: 'Chicken', price: 1.49 },
      { variantId: 'gid://shopify/ProductVariant/21', title: 'Salmon', price: 1.49 },
    ])
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      discounts: [{
        discountId: 'disc_x', name: 'X', title: 'X', status: 'live', pricingMode: 'percent',
        members: [{ productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20' }],
        tiers: [],
      }],
    })
    expect(await searchProductsAction('cat')).toEqual([{ id: 'gid://shopify/Product/2', title: 'Wet Cat Food', variantCount: 2, imageUrl: null }])
  })
})

describe('listProductsAction', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('lists the first products without a search term', async () => {
    const spy = vi.spyOn(products, 'listProducts').mockResolvedValue([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1, imageUrl: null }])
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })
    expect(await listProductsAction()).toEqual([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1, imageUrl: null }])
    expect(spy).toHaveBeenCalledWith({ limit: 8 })
  })

  it('drops a product already claimed by another discount but keeps one claimed by the discount being edited', async () => {
    vi.spyOn(products, 'listProducts').mockResolvedValue([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1, imageUrl: null }])
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      discounts: [{ discountId: 'disc_1', name: 'X', title: 'X', status: 'live', pricingMode: 'percent', members: [{ productId: 'gid://shopify/Product/1' }], tiers: [] }],
    })
    expect(await listProductsAction()).toEqual([])
    expect(await listProductsAction('disc_1')).toHaveLength(1)
  })

  it('returns [] instead of throwing when the lookup fails', async () => {
    vi.spyOn(products, 'listProducts').mockRejectedValue(new Error('boom'))
    expect(await listProductsAction()).toEqual([])
  })
})

describe('getProductVariantsAction', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns [] instead of throwing when the lookup fails', async () => {
    vi.spyOn(products, 'getProductVariantOptions').mockRejectedValue(new Error('boom'))
    expect(await getProductVariantsAction('gid://shopify/Product/1')).toEqual([])
  })

  it('drops a variant already claimed by another discount, keeps the free one', async () => {
    vi.spyOn(products, 'getProductVariantOptions').mockResolvedValue([
      { variantId: 'gid://shopify/ProductVariant/20', title: 'Chicken', price: 1.49 },
      { variantId: 'gid://shopify/ProductVariant/21', title: 'Salmon', price: 1.49 },
    ])
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      discounts: [{
        discountId: 'disc_x', name: 'X', title: 'X', status: 'live', pricingMode: 'percent',
        members: [{ productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20' }],
        tiers: [],
      }],
    })
    expect(await getProductVariantsAction('gid://shopify/Product/2')).toEqual([
      { variantId: 'gid://shopify/ProductVariant/21', title: 'Salmon', price: 1.49 },
    ])
  })

  it('keeps a variant claimed only by the discount being edited', async () => {
    vi.spyOn(products, 'getProductVariantOptions').mockResolvedValue([
      { variantId: 'gid://shopify/ProductVariant/20', title: 'Chicken', price: 1.49 },
    ])
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      discounts: [{
        discountId: 'disc_1', name: 'X', title: 'X', status: 'live', pricingMode: 'percent',
        members: [{ productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20' }],
        tiers: [],
      }],
    })
    expect(await getProductVariantsAction('gid://shopify/Product/2', 'disc_1')).toEqual([
      { variantId: 'gid://shopify/ProductVariant/20', title: 'Chicken', price: 1.49 },
    ])
  })
})

describe('validateMemberAction', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('rejects a product/variant already claimed by another discount', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      discounts: [{ discountId: 'disc_x', name: 'X', title: 'X', status: 'live', pricingMode: 'percent', members: [{ productId: 'gid://shopify/Product/1' }], tiers: [] }],
    })

    const result = await validateMemberAction('gid://shopify/Product/1', undefined)
    expect(result).toEqual({ ok: false, error: 'This product already belongs to another discount' })
  })

  it('allows a product/variant that is free', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })

    expect(await validateMemberAction('gid://shopify/Product/1', undefined)).toEqual({ ok: true })
  })

  it('excludes the discount being edited', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      discounts: [{ discountId: 'disc_1', name: 'X', title: 'X', status: 'live', pricingMode: 'percent', members: [{ productId: 'gid://shopify/Product/1' }], tiers: [] }],
    })

    expect(await validateMemberAction('gid://shopify/Product/1', undefined, 'disc_1')).toEqual({ ok: true })
  })
})
