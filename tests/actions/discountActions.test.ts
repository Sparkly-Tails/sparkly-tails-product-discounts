import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createDiscount, updateDiscountMembers, updateDiscountTiers, updateDiscountTitle, setDiscountStatus, deleteDiscount,
} from '@/actions/discountActions'
import * as configLib from '@/lib/config'
import * as authRedirect from '@/lib/auth-redirect'
import * as productTiers from '@/lib/product-tiers'
import * as products from '@/lib/products'
import type { Config, Discount } from '@/lib/config'

vi.mock('@/lib/auth-redirect', () => ({ redirectWithToken: vi.fn() }))

function memberFormData(members: { productId: string; variantId?: string }[], extra: Record<string, string> = {}) {
  const fd = new FormData()
  members.forEach((m, i) => {
    fd.set(`member-${i}-productId`, m.productId)
    if (m.variantId) fd.set(`member-${i}-variantId`, m.variantId)
  })
  Object.entries(extra).forEach(([k, v]) => fd.set(k, v))
  return fd
}

describe('createDiscount', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('creates a single-member discount with parsed tiers', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(products, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'Tuna Soup', price: 1.49, handle: 'tuna-soup', imageUrl: null },
    ])

    const formData = memberFormData(
      [{ productId: 'gid://shopify/Product/1' }],
      { name: 'Tuna Soup', title: 'Tuna Soup', 'tier-0-minQty': '5', 'tier-0-percentOff': '10' },
    )

    await createDiscount(formData)

    expect(saveSpy).toHaveBeenCalledWith({
      discounts: [{
        discountId: expect.stringMatching(/^disc_/),
        name: 'Tuna Soup', title: 'Tuna Soup', status: 'draft', pricingMode: 'percent',
        members: [{ productId: 'gid://shopify/Product/1' }],
        tiers: [{ minQty: 5, percentOff: 10 }],
      }],
    })
    expect(authRedirect.redirectWithToken).toHaveBeenCalledWith(expect.stringMatching(/^\/discounts\/disc_/))
  })

  it('creates a multi-member discount mixing a whole product and a specific variant', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(products, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'Tuna Soup', price: 1.49, handle: 'tuna-soup', imageUrl: null },
      { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20', title: 'Wet Cat Food – Chicken', price: 1.49, handle: 'wet-cat-food', imageUrl: null },
    ])

    const formData = memberFormData(
      [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20' }],
      { name: 'Mix', title: 'Mix', 'tier-0-minQty': '7', 'tier-0-percentOff': '4' },
    )

    await createDiscount(formData)

    expect(saveSpy).toHaveBeenCalledWith(expect.objectContaining({
      discounts: [expect.objectContaining({
        members: [
          { productId: 'gid://shopify/Product/1' },
          { productId: 'gid://shopify/Product/2', variantId: 'gid://shopify/ProductVariant/20' },
        ],
      })],
    }))
  })

  it('rejects fixedPrice tiers when members have different prices', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })
    vi.spyOn(products, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'A', price: 1.49, handle: 'a', imageUrl: null },
      { productId: 'gid://shopify/Product/2', variantId: undefined, title: 'B', price: 1.59, handle: 'b', imageUrl: null },
    ])

    const formData = memberFormData(
      [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }],
      { name: 'Mix', title: 'Mix', pricingMode: 'fixed', 'tier-0-minQty': '3', 'tier-0-fixedPrice': '1.20' },
    )

    await expect(createDiscount(formData)).rejects.toThrow(/different prices/)
  })

  it('rejects an anchorPrice tier when members have different prices', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })
    vi.spyOn(products, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'A', price: 1.49, handle: 'a', imageUrl: null },
      { productId: 'gid://shopify/Product/2', variantId: undefined, title: 'B', price: 1.59, handle: 'b', imageUrl: null },
    ])

    const formData = memberFormData(
      [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }],
      { name: 'Mix', title: 'Mix', 'tier-0-minQty': '7', 'tier-0-percentOff': '4', 'tier-0-anchorPrice': '10' },
    )

    await expect(createDiscount(formData)).rejects.toThrow(/different prices/)
  })

  it('allows plain percent tiers (no anchor) when members have different prices', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(products, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'A', price: 1.49, handle: 'a', imageUrl: null },
      { productId: 'gid://shopify/Product/2', variantId: undefined, title: 'B', price: 1.59, handle: 'b', imageUrl: null },
    ])

    const formData = memberFormData(
      [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }],
      { name: 'Mix', title: 'Mix', 'tier-0-minQty': '7', 'tier-0-percentOff': '4' },
    )

    await createDiscount(formData)
    expect(saveSpy).toHaveBeenCalled()
  })

  it('rejects when a member is already claimed by another discount', async () => {
    const existing: Config = {
      discounts: [{
        discountId: 'disc_x', name: 'X', title: 'X', status: 'live', pricingMode: 'percent',
        members: [{ productId: 'gid://shopify/Product/1' }], tiers: [],
      }],
    }
    vi.spyOn(configLib, 'getConfig').mockResolvedValue(existing)
    vi.spyOn(products, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'A', price: 1.49, handle: 'a', imageUrl: null },
    ])

    const formData = memberFormData(
      [{ productId: 'gid://shopify/Product/1' }],
      { name: 'Dup', title: 'Dup', 'tier-0-minQty': '5', 'tier-0-percentOff': '10' },
    )

    await expect(createDiscount(formData)).rejects.toThrow(/already/)
  })
})

describe('setDiscountStatus', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('syncs metafields when going live', async () => {
    const discount: Discount = {
      discountId: 'disc_1', name: 'A', title: 'A', status: 'draft', pricingMode: 'percent',
      members: [{ productId: 'gid://shopify/Product/1' }], tiers: [{ minQty: 5, percentOff: 10 }],
    }
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [discount] })
    vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    const syncSpy = vi.spyOn(productTiers, 'syncDiscountMetafields').mockResolvedValue()

    await setDiscountStatus('disc_1', 'live')

    expect(syncSpy).toHaveBeenCalledWith(expect.objectContaining({ discountId: 'disc_1', status: 'live' }))
  })

  it('clears metafields when taken offline', async () => {
    const discount: Discount = {
      discountId: 'disc_1', name: 'A', title: 'A', status: 'live', pricingMode: 'percent',
      members: [{ productId: 'gid://shopify/Product/1' }], tiers: [{ minQty: 5, percentOff: 10 }],
    }
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [discount] })
    vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    const clearSpy = vi.spyOn(productTiers, 'clearDiscountMetafields').mockResolvedValue()

    await setDiscountStatus('disc_1', 'draft')

    expect(clearSpy).toHaveBeenCalledWith([{ productId: 'gid://shopify/Product/1' }])
  })
})

describe('deleteDiscount', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('removes the discount and clears its metafields', async () => {
    const discount: Discount = {
      discountId: 'disc_1', name: 'A', title: 'A', status: 'live', pricingMode: 'percent',
      members: [{ productId: 'gid://shopify/Product/1' }], tiers: [],
    }
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [discount] })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    const clearSpy = vi.spyOn(productTiers, 'clearDiscountMetafields').mockResolvedValue()

    await deleteDiscount('disc_1')

    expect(saveSpy).toHaveBeenCalledWith({ discounts: [] })
    expect(clearSpy).toHaveBeenCalledWith([{ productId: 'gid://shopify/Product/1' }])
  })
})
