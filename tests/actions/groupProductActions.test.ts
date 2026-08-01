import { describe, it, expect, vi, beforeEach } from 'vitest'
import { addGroupProductAction } from '@/actions/groupProductActions'
import * as products from '@/lib/products'
import * as configLib from '@/lib/config'

describe('addGroupProductAction', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('rejects a product that does not exist', async () => {
    vi.spyOn(products, 'getProductInfo').mockResolvedValue(null)
    const result = await addGroupProductAction('gid://shopify/Product/999', null)
    expect(result).toEqual({ ok: false, error: 'Product not found' })
  })

  it('rejects a price mismatch against the group so far', async () => {
    vi.spyOn(products, 'getProductInfo').mockResolvedValue({ title: 'Ocean Soup', basePrice: 1.69 })
    const result = await addGroupProductAction('gid://shopify/Product/3', 1.49)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Price mismatch')
  })

  it('rejects a product that already has a standalone discount', async () => {
    vi.spyOn(products, 'getProductInfo').mockResolvedValue({ title: 'Tuna Soup', basePrice: 1.49 })
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [{ productId: 'gid://shopify/Product/1', status: 'draft', tiers: [] }],
      groups: [],
    })
    const result = await addGroupProductAction('gid://shopify/Product/1', null)
    expect(result).toEqual({ ok: false, error: 'This product already has a discount or belongs to another group' })
  })

  it('rejects a product that already belongs to another group', async () => {
    vi.spyOn(products, 'getProductInfo').mockResolvedValue({ title: 'Tuna Soup', basePrice: 1.49 })
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_other', name: 'Other', status: 'draft', productIds: ['gid://shopify/Product/1'], tiers: [] }],
    })
    const result = await addGroupProductAction('gid://shopify/Product/1', null)
    expect(result).toEqual({ ok: false, error: 'This product already has a discount or belongs to another group' })
  })

  it('allows a product already in the group currently being edited', async () => {
    vi.spyOn(products, 'getProductInfo').mockResolvedValue({ title: 'Tuna Soup', basePrice: 1.49 })
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'A', status: 'draft', productIds: ['gid://shopify/Product/1'], tiers: [] }],
    })
    const result = await addGroupProductAction('gid://shopify/Product/1', 1.49, 'grp_a')
    expect(result).toEqual({ ok: true, product: { id: 'gid://shopify/Product/1', title: 'Tuna Soup', price: 1.49 } })
  })

  it('succeeds for a valid, price-matching, unclaimed product', async () => {
    vi.spyOn(products, 'getProductInfo').mockResolvedValue({ title: 'Chicken Soup', basePrice: 1.49 })
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [], groups: [] })
    const result = await addGroupProductAction('gid://shopify/Product/2', 1.49)
    expect(result).toEqual({ ok: true, product: { id: 'gid://shopify/Product/2', title: 'Chicken Soup', price: 1.49 } })
  })
})
