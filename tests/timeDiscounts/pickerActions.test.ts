import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  searchTimeDiscountProductsAction, getTimeDiscountProductVariantsAction,
  validateTimeDiscountMemberAction, searchTimeDiscountCollectionsAction,
} from '@/timeDiscounts/pickerActions'
import * as productsLib from '@/lib/products'
import * as collectionsLib from '@/lib/collections'
import * as configLib from '@/lib/config'
import * as timeConfigLib from '@/timeDiscounts/config'

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })
  vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [] })
})

describe('searchTimeDiscountProductsAction', () => {
  it('returns [] instead of throwing when the search fails', async () => {
    vi.spyOn(productsLib, 'searchProducts').mockRejectedValue(new Error('boom'))
    expect(await searchTimeDiscountProductsAction('tuna')).toEqual([])
  })

  it('drops a single-variant result already claimed by the existing tiered-discount system', async () => {
    vi.spyOn(productsLib, 'searchProducts').mockResolvedValue([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 }])
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      discounts: [{ discountId: 'disc_1', name: 'X', title: 'X', status: 'live', pricingMode: 'percent', members: [{ productId: 'gid://shopify/Product/1' }], tiers: [] }],
    })
    expect(await searchTimeDiscountProductsAction('tuna')).toEqual([])
  })

  it('drops a single-variant result already claimed by another time discount', async () => {
    vi.spyOn(productsLib, 'searchProducts').mockResolvedValue([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 }])
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({
      discounts: [{
        discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'X', title: 'X', pricingMode: 'percent', amount: 10,
        startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
        selection: { mode: 'products', members: [{ productId: 'gid://shopify/Product/1' }] },
        resolvedMembers: [{ productId: 'gid://shopify/Product/1' }],
      }],
    })
    expect(await searchTimeDiscountProductsAction('tuna')).toEqual([])
  })

  it('keeps a result claimed only by the discount being edited', async () => {
    vi.spyOn(productsLib, 'searchProducts').mockResolvedValue([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 }])
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({
      discounts: [{
        discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'X', title: 'X', pricingMode: 'percent', amount: 10,
        startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
        selection: { mode: 'products', members: [{ productId: 'gid://shopify/Product/1' }] },
        resolvedMembers: [{ productId: 'gid://shopify/Product/1' }],
      }],
    })
    expect(await searchTimeDiscountProductsAction('tuna', 'time_disc_1')).toEqual([{ id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1 }])
  })
})

describe('getTimeDiscountProductVariantsAction', () => {
  it('returns [] instead of throwing when the lookup fails', async () => {
    vi.spyOn(productsLib, 'getProductVariantOptions').mockRejectedValue(new Error('boom'))
    expect(await getTimeDiscountProductVariantsAction('gid://shopify/Product/1')).toEqual([])
  })
})

describe('validateTimeDiscountMemberAction', () => {
  it('rejects a product already claimed by another discount', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      discounts: [{ discountId: 'disc_1', name: 'X', title: 'X', status: 'live', pricingMode: 'percent', members: [{ productId: 'gid://shopify/Product/1' }], tiers: [] }],
    })
    expect(await validateTimeDiscountMemberAction('gid://shopify/Product/1', undefined)).toEqual({ ok: false, error: 'This product already belongs to another discount' })
  })

  it('allows a product that is free', async () => {
    expect(await validateTimeDiscountMemberAction('gid://shopify/Product/1', undefined)).toEqual({ ok: true })
  })
})

describe('searchTimeDiscountCollectionsAction', () => {
  it('returns [] instead of throwing when the search fails', async () => {
    vi.spyOn(collectionsLib, 'searchCollections').mockRejectedValue(new Error('boom'))
    expect(await searchTimeDiscountCollectionsAction('summer')).toEqual([])
  })

  it('passes through results on success', async () => {
    vi.spyOn(collectionsLib, 'searchCollections').mockResolvedValue([{ id: 'gid://shopify/Collection/1', title: 'Summer' }])
    expect(await searchTimeDiscountCollectionsAction('summer')).toEqual([{ id: 'gid://shopify/Collection/1', title: 'Summer' }])
  })
})
