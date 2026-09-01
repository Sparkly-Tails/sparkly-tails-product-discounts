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

describe('updateDiscountMembers', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('rejects a member set with different prices when the stored discount is fixed-price', async () => {
    const discount: Discount = {
      discountId: 'disc_1', name: 'A', title: 'A', status: 'draft', pricingMode: 'fixed',
      members: [{ productId: 'gid://shopify/Product/1' }], tiers: [{ minQty: 3, fixedPrice: 1.20 }],
    }
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [discount] })
    vi.spyOn(products, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'A', price: 1.49, handle: 'a', imageUrl: null },
      { productId: 'gid://shopify/Product/2', variantId: undefined, title: 'B', price: 1.59, handle: 'b', imageUrl: null },
    ])

    const formData = memberFormData([{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }])

    await expect(updateDiscountMembers('disc_1', formData)).rejects.toThrow(/different prices/)
  })

  it('rejects a member set with different prices when a stored tier has an anchorPrice', async () => {
    const discount: Discount = {
      discountId: 'disc_1', name: 'A', title: 'A', status: 'draft', pricingMode: 'percent',
      members: [{ productId: 'gid://shopify/Product/1' }], tiers: [{ minQty: 7, percentOff: 4, anchorPrice: 10 }],
    }
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [discount] })
    vi.spyOn(products, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'A', price: 1.49, handle: 'a', imageUrl: null },
      { productId: 'gid://shopify/Product/2', variantId: undefined, title: 'B', price: 1.59, handle: 'b', imageUrl: null },
    ])

    const formData = memberFormData([{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }])

    await expect(updateDiscountMembers('disc_1', formData)).rejects.toThrow(/different prices/)
  })

  it('allows a member set with different prices when the stored tiers are plain percent (no anchor)', async () => {
    const discount: Discount = {
      discountId: 'disc_1', name: 'A', title: 'A', status: 'draft', pricingMode: 'percent',
      members: [{ productId: 'gid://shopify/Product/1' }], tiers: [{ minQty: 7, percentOff: 4 }],
    }
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [discount] })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(products, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'A', price: 1.49, handle: 'a', imageUrl: null },
      { productId: 'gid://shopify/Product/2', variantId: undefined, title: 'B', price: 1.59, handle: 'b', imageUrl: null },
    ])

    const formData = memberFormData([{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }])

    await updateDiscountMembers('disc_1', formData)

    expect(saveSpy).toHaveBeenCalledWith({
      discounts: [expect.objectContaining({
        discountId: 'disc_1',
        members: [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }],
      })],
    })
  })

  it('allows a member set with uniform prices regardless of pricing mode', async () => {
    const discount: Discount = {
      discountId: 'disc_1', name: 'A', title: 'A', status: 'draft', pricingMode: 'fixed',
      members: [{ productId: 'gid://shopify/Product/1' }], tiers: [{ minQty: 3, fixedPrice: 1.20 }],
    }
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [discount] })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(products, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'A', price: 1.49, handle: 'a', imageUrl: null },
      { productId: 'gid://shopify/Product/2', variantId: undefined, title: 'B', price: 1.49, handle: 'b', imageUrl: null },
    ])

    const formData = memberFormData([{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }])

    await updateDiscountMembers('disc_1', formData)

    expect(saveSpy).toHaveBeenCalledWith({
      discounts: [expect.objectContaining({
        discountId: 'disc_1',
        members: [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }],
      })],
    })
  })

  it('clears metafields for a product removed from a live discount and re-syncs the rest', async () => {
    const discount: Discount = {
      discountId: 'disc_1', name: 'A', title: 'A', status: 'live', pricingMode: 'percent',
      members: [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }],
      tiers: [{ minQty: 7, percentOff: 4 }],
    }
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [discount] })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    const clearSpy = vi.spyOn(productTiers, 'clearDiscountMetafields').mockResolvedValue()
    const syncSpy = vi.spyOn(productTiers, 'syncDiscountMetafields').mockResolvedValue()
    vi.spyOn(products, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'A', price: 1.49, handle: 'a', imageUrl: null },
    ])

    const formData = memberFormData([{ productId: 'gid://shopify/Product/1' }])

    await updateDiscountMembers('disc_1', formData)

    expect(saveSpy).toHaveBeenCalledWith({
      discounts: [expect.objectContaining({
        discountId: 'disc_1',
        members: [{ productId: 'gid://shopify/Product/1' }],
      })],
    })
    expect(clearSpy).toHaveBeenCalledWith([{ productId: 'gid://shopify/Product/2' }])
    expect(syncSpy).toHaveBeenCalledWith(expect.objectContaining({
      discountId: 'disc_1',
      members: [{ productId: 'gid://shopify/Product/1' }],
    }))
  })
})

describe('updateDiscountTiers', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('rejects a submitted fixedPrice tier when the stored members have different prices', async () => {
    const discount: Discount = {
      discountId: 'disc_1', name: 'A', title: 'A', status: 'draft', pricingMode: 'fixed',
      members: [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }],
      tiers: [{ minQty: 1, fixedPrice: 1.00 }],
    }
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [discount] })
    vi.spyOn(products, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'A', price: 1.49, handle: 'a', imageUrl: null },
      { productId: 'gid://shopify/Product/2', variantId: undefined, title: 'B', price: 1.59, handle: 'b', imageUrl: null },
    ])

    const formData = new FormData()
    formData.set('tier-0-minQty', '3')
    formData.set('tier-0-fixedPrice', '1.20')

    await expect(updateDiscountTiers('disc_1', formData)).rejects.toThrow(/different prices/)
  })

  it('rejects a submitted anchorPrice tier when the stored members have different prices', async () => {
    const discount: Discount = {
      discountId: 'disc_1', name: 'A', title: 'A', status: 'draft', pricingMode: 'percent',
      members: [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }],
      tiers: [{ minQty: 5, percentOff: 10 }],
    }
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [discount] })
    vi.spyOn(products, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'A', price: 1.49, handle: 'a', imageUrl: null },
      { productId: 'gid://shopify/Product/2', variantId: undefined, title: 'B', price: 1.59, handle: 'b', imageUrl: null },
    ])

    const formData = new FormData()
    formData.set('tier-0-minQty', '7')
    formData.set('tier-0-percentOff', '4')
    formData.set('tier-0-anchorPrice', '10')

    await expect(updateDiscountTiers('disc_1', formData)).rejects.toThrow(/different prices/)
  })

  it('allows a submitted plain percent tier (no anchor) when the stored members have different prices', async () => {
    const discount: Discount = {
      discountId: 'disc_1', name: 'A', title: 'A', status: 'draft', pricingMode: 'percent',
      members: [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }],
      tiers: [{ minQty: 5, percentOff: 10 }],
    }
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [discount] })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(products, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'A', price: 1.49, handle: 'a', imageUrl: null },
      { productId: 'gid://shopify/Product/2', variantId: undefined, title: 'B', price: 1.59, handle: 'b', imageUrl: null },
    ])

    const formData = new FormData()
    formData.set('tier-0-minQty', '7')
    formData.set('tier-0-percentOff', '4')

    await updateDiscountTiers('disc_1', formData)

    expect(saveSpy).toHaveBeenCalledWith({
      discounts: [expect.objectContaining({ discountId: 'disc_1', tiers: [{ minQty: 7, percentOff: 4 }] })],
    })
  })
})

describe('updateDiscountTitle', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('updates the title and re-syncs metafields when the discount is live', async () => {
    const discount: Discount = {
      discountId: 'disc_1', name: 'A', title: 'Old Title', status: 'live', pricingMode: 'percent',
      members: [{ productId: 'gid://shopify/Product/1' }], tiers: [{ minQty: 5, percentOff: 10 }],
    }
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [discount] })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    const syncSpy = vi.spyOn(productTiers, 'syncDiscountMetafields').mockResolvedValue()

    const formData = new FormData()
    formData.set('title', 'New Title')

    await updateDiscountTitle('disc_1', formData)

    expect(saveSpy).toHaveBeenCalledWith({
      discounts: [expect.objectContaining({ discountId: 'disc_1', title: 'New Title' })],
    })
    expect(syncSpy).toHaveBeenCalledWith(expect.objectContaining({ discountId: 'disc_1', title: 'New Title' }))
  })

  it('does not sync metafields when the discount is draft', async () => {
    const discount: Discount = {
      discountId: 'disc_1', name: 'A', title: 'Old Title', status: 'draft', pricingMode: 'percent',
      members: [{ productId: 'gid://shopify/Product/1' }], tiers: [],
    }
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [discount] })
    vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    const syncSpy = vi.spyOn(productTiers, 'syncDiscountMetafields').mockResolvedValue()

    const formData = new FormData()
    formData.set('title', 'New Title')

    await updateDiscountTitle('disc_1', formData)

    expect(syncSpy).not.toHaveBeenCalled()
  })

  it('requires a non-blank title', async () => {
    const discount: Discount = {
      discountId: 'disc_1', name: 'A', title: 'Old Title', status: 'draft', pricingMode: 'percent',
      members: [{ productId: 'gid://shopify/Product/1' }], tiers: [],
    }
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [discount] })

    const formData = new FormData()
    formData.set('title', '   ')

    await expect(updateDiscountTitle('disc_1', formData)).rejects.toThrow('A title is required')
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
