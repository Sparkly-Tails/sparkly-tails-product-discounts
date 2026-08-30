import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchProductsAction, getProductVariantsAction, validateMemberAction } from '@/actions/memberPickerActions'
import * as products from '@/lib/products'
import * as configLib from '@/lib/config'

describe('searchProductsAction', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns [] instead of throwing when the search fails', async () => {
    vi.spyOn(products, 'searchProducts').mockRejectedValue(new Error('boom'))
    expect(await searchProductsAction('tuna')).toEqual([])
  })

  it('passes through the search results on success', async () => {
    vi.spyOn(products, 'searchProducts').mockResolvedValue([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 }])
    expect(await searchProductsAction('tuna')).toEqual([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 }])
  })
})

describe('getProductVariantsAction', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns [] instead of throwing when the lookup fails', async () => {
    vi.spyOn(products, 'getProductVariantOptions').mockRejectedValue(new Error('boom'))
    expect(await getProductVariantsAction('gid://shopify/Product/1')).toEqual([])
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
