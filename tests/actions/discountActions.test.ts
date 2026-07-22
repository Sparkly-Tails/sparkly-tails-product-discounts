import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createDiscount, updateTiers, setStatus, deleteDiscount } from '@/actions/discountActions'
import * as configLib from '@/lib/config'
import * as authRedirect from '@/lib/auth-redirect'

vi.mock('@/lib/auth-redirect', () => ({ redirectWithToken: vi.fn() }))

describe('createDiscount', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('adds a new product discount with parsed tiers', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [] })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

    const formData = new FormData()
    formData.set('productId', 'gid://shopify/Product/111')
    formData.set('tier-0-minQty', '5')
    formData.set('tier-0-percentOff', '10')

    await createDiscount(formData)

    expect(saveSpy).toHaveBeenCalledWith({
      products: [{ productId: 'gid://shopify/Product/111', status: 'draft', tiers: [{ minQty: 5, percentOff: 10 }] }],
    })
    expect(authRedirect.redirectWithToken).toHaveBeenCalledWith('/discounts/gid%3A%2F%2Fshopify%2FProduct%2F111')
  })

  it('throws when no product is selected', async () => {
    const formData = new FormData()
    formData.set('tier-0-minQty', '5')
    formData.set('tier-0-percentOff', '10')
    await expect(createDiscount(formData)).rejects.toThrow('A product is required')
  })

  it('throws when no valid tier is provided', async () => {
    const formData = new FormData()
    formData.set('productId', 'gid://shopify/Product/111')
    await expect(createDiscount(formData)).rejects.toThrow('At least one tier is required')
  })

  it('throws when the product already has a discount configured', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [{ productId: 'gid://shopify/Product/111', status: 'draft', tiers: [] }],
    })
    const formData = new FormData()
    formData.set('productId', 'gid://shopify/Product/111')
    formData.set('tier-0-minQty', '5')
    formData.set('tier-0-percentOff', '10')
    await expect(createDiscount(formData)).rejects.toThrow('already has a discount configured')
  })
})

describe('updateTiers', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('replaces the tiers for an existing product', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [{ productId: 'gid://shopify/Product/111', status: 'live', tiers: [{ minQty: 5, percentOff: 10 }] }],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

    const formData = new FormData()
    formData.set('tier-0-minQty', '3')
    formData.set('tier-0-percentOff', '5')
    formData.set('tier-1-minQty', '8')
    formData.set('tier-1-percentOff', '12')

    await updateTiers('gid://shopify/Product/111', formData)

    expect(saveSpy).toHaveBeenCalledWith({
      products: [{
        productId: 'gid://shopify/Product/111',
        status: 'live',
        tiers: [{ minQty: 3, percentOff: 5 }, { minQty: 8, percentOff: 12 }],
      }],
    })
  })

  it('throws when the product has no existing discount', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [] })
    const formData = new FormData()
    formData.set('tier-0-minQty', '5')
    formData.set('tier-0-percentOff', '10')
    await expect(updateTiers('gid://shopify/Product/999', formData)).rejects.toThrow('not found')
  })
})

describe('setStatus', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('flips a product discount to live', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [{ productId: 'gid://shopify/Product/111', status: 'draft', tiers: [{ minQty: 5, percentOff: 10 }] }],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

    await setStatus('gid://shopify/Product/111', 'live')

    expect(saveSpy).toHaveBeenCalledWith({
      products: [{ productId: 'gid://shopify/Product/111', status: 'live', tiers: [{ minQty: 5, percentOff: 10 }] }],
    })
  })
})

describe('deleteDiscount', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('removes the product entirely from config', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [
        { productId: 'gid://shopify/Product/111', status: 'live', tiers: [] },
        { productId: 'gid://shopify/Product/222', status: 'draft', tiers: [] },
      ],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

    await deleteDiscount('gid://shopify/Product/111')

    expect(saveSpy).toHaveBeenCalledWith({
      products: [{ productId: 'gid://shopify/Product/222', status: 'draft', tiers: [] }],
    })
  })
})
