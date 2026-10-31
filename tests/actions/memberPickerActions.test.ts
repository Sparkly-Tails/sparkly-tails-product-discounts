import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchProductsAction, listProductsAction, getProductVariantsAction, validateMemberAction } from '@/actions/memberPickerActions'
import * as products from '@/lib/products'
import { getConfig, type Discount } from '@/lib/config'

vi.mock('@/lib/config', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/config')>()), getConfig: vi.fn() }))

const TUNA = { id: 'gid://shopify/Product/1', title: 'Tuna Soup', variantCount: 1, imageUrl: null }

function tierDiscount(overrides: Partial<Discount>): Discount {
  return { discountId: 'disc_x', name: 'Spring', title: 'Spring', status: 'live', pricingMode: 'percent', members: [{ productId: TUNA.id }], tiers: [], ...overrides }
}

describe('searchProductsAction', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns [] instead of throwing when the search fails', async () => {
    vi.spyOn(products, 'searchProducts').mockRejectedValue(new Error('boom'))
    expect(await searchProductsAction('tuna')).toEqual([])
  })

  it('lists every product the search finds, whatever discount holds it', async () => {
    vi.spyOn(products, 'searchProducts').mockResolvedValue([TUNA, { id: 'gid://shopify/Product/2', title: 'Wet Cat Food', variantCount: 2, imageUrl: null }])
    expect(await searchProductsAction('food')).toHaveLength(2)
    expect(getConfig).not.toHaveBeenCalled()
  })
})

describe('listProductsAction', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('lists the first products without a search term', async () => {
    const spy = vi.spyOn(products, 'listProducts').mockResolvedValue([TUNA])
    expect(await listProductsAction()).toEqual([TUNA])
    expect(spy).toHaveBeenCalledWith({ limit: 8 })
  })

  it('returns [] instead of throwing when the lookup fails', async () => {
    vi.spyOn(products, 'listProducts').mockRejectedValue(new Error('boom'))
    expect(await listProductsAction()).toEqual([])
  })
})

describe('getProductVariantsAction', () => {
  beforeEach(() => vi.restoreAllMocks())

  const VARIANTS = [
    { variantId: 'gid://shopify/ProductVariant/20', title: 'Chicken', price: 1.49 },
    { variantId: 'gid://shopify/ProductVariant/21', title: 'Salmon', price: 1.49 },
  ]

  it('returns [] instead of throwing when the lookup fails', async () => {
    vi.spyOn(products, 'getProductVariantOptions').mockRejectedValue(new Error('boom'))
    expect(await getProductVariantsAction('gid://shopify/Product/1')).toEqual([])
  })

  it('lists every variant, even one that another discount holds', async () => {
    vi.spyOn(products, 'getProductVariantOptions').mockResolvedValue(VARIANTS)
    expect(await getProductVariantsAction('gid://shopify/Product/2')).toEqual(VARIANTS)
  })
})

describe('validateMemberAction', () => {
  beforeEach(() => vi.mocked(getConfig).mockReset())

  it('refuses a product that another live discount has, naming that discount', async () => {
    vi.mocked(getConfig).mockResolvedValue({ discounts: [tierDiscount({})] })
    expect(await validateMemberAction(TUNA.id, undefined)).toEqual({ ok: false, error: 'Product already in discount "Spring"' })
  })

  it('refuses a variant that another live discount has', async () => {
    vi.mocked(getConfig).mockResolvedValue({ discounts: [tierDiscount({ members: [{ productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20' }] })] })
    expect(await validateMemberAction('gid://shopify/Product/2', 'gid://shopify/ProductVariant/20')).toEqual({ ok: false, error: 'Variant already in discount "Spring"' })
    expect(await validateMemberAction('gid://shopify/Product/2', 'gid://shopify/ProductVariant/21')).toEqual({ ok: true })
  })

  it('allows a product that only a draft discount has', async () => {
    vi.mocked(getConfig).mockResolvedValue({ discounts: [tierDiscount({ status: 'draft' })] })
    expect(await validateMemberAction(TUNA.id, undefined)).toEqual({ ok: true })
  })

  it('allows a product that no discount has', async () => {
    vi.mocked(getConfig).mockResolvedValue({ discounts: [] })
    expect(await validateMemberAction(TUNA.id, undefined)).toEqual({ ok: true })
  })

  it('does not count the discount being edited against itself', async () => {
    vi.mocked(getConfig).mockResolvedValue({ discounts: [tierDiscount({ discountId: 'disc_1' })] })
    expect(await validateMemberAction(TUNA.id, undefined, 'disc_1')).toEqual({ ok: true })
  })
})
