import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createDiscount, updateTiers, setStatus, deleteDiscount,
  createGroup, updateGroupProducts, updateGroupTiers, setGroupStatus, deleteGroup,
} from '@/actions/discountActions'
import * as configLib from '@/lib/config'
import * as authRedirect from '@/lib/auth-redirect'
import * as productTiers from '@/lib/product-tiers'
import * as products from '@/lib/products'

vi.mock('@/lib/auth-redirect', () => ({ redirectWithToken: vi.fn() }))

describe('createDiscount', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('adds a new product discount with parsed tiers', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [], groups: [] })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

    const formData = new FormData()
    formData.set('productId', 'gid://shopify/Product/111')
    formData.set('tier-0-minQty', '5')
    formData.set('tier-0-percentOff', '10')

    await createDiscount(formData)

    expect(saveSpy).toHaveBeenCalledWith({
      products: [{ productId: 'gid://shopify/Product/111', status: 'draft', pricingMode: 'percent', tiers: [{ minQty: 5, percentOff: 10 }] }],
      groups: [],
    })
    expect(authRedirect.redirectWithToken).toHaveBeenCalledWith('/discounts/gid%3A%2F%2Fshopify%2FProduct%2F111')
  })

  it('includes anchorPrice when provided, omits it when blank', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [], groups: [] })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

    const formData = new FormData()
    formData.set('productId', 'gid://shopify/Product/111')
    formData.set('tier-0-minQty', '7')
    formData.set('tier-0-percentOff', '5')
    formData.set('tier-0-anchorPrice', '10.00')
    formData.set('tier-1-minQty', '14')
    formData.set('tier-1-percentOff', '10')
    formData.set('tier-1-anchorPrice', '')

    await createDiscount(formData)

    expect(saveSpy).toHaveBeenCalledWith({
      products: [{
        productId: 'gid://shopify/Product/111',
        status: 'draft', pricingMode: 'percent',
        tiers: [
          { minQty: 7, percentOff: 5, anchorPrice: 10 },
          { minQty: 14, percentOff: 10 },
        ],
      }],
      groups: [],
    })
  })

  it('creates a fixed-price discount when pricingMode is fixed', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [], groups: [] })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

    const formData = new FormData()
    formData.set('productId', 'gid://shopify/Product/111')
    formData.set('pricingMode', 'fixed')
    formData.set('tier-0-minQty', '1')
    formData.set('tier-0-fixedPrice', '1.70')
    formData.set('tier-1-minQty', '3')
    formData.set('tier-1-fixedPrice', '1.50')

    await createDiscount(formData)

    expect(saveSpy).toHaveBeenCalledWith({
      products: [{
        productId: 'gid://shopify/Product/111',
        status: 'draft',
        pricingMode: 'fixed',
        tiers: [
          { minQty: 1, fixedPrice: 1.70 },
          { minQty: 3, fixedPrice: 1.50 },
        ],
      }],
      groups: [],
    })
  })

  it('ignores percentOff/anchorPrice fields entirely when pricingMode is fixed', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [], groups: [] })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

    const formData = new FormData()
    formData.set('productId', 'gid://shopify/Product/111')
    formData.set('pricingMode', 'fixed')
    formData.set('tier-0-minQty', '1')
    formData.set('tier-0-fixedPrice', '1.70')
    formData.set('tier-0-percentOff', '50')
    formData.set('tier-0-anchorPrice', '99.00')

    await createDiscount(formData)

    expect(saveSpy).toHaveBeenCalledWith({
      products: [{
        productId: 'gid://shopify/Product/111',
        status: 'draft',
        pricingMode: 'fixed',
        tiers: [{ minQty: 1, fixedPrice: 1.70 }],
      }],
      groups: [],
    })
  })

  it('defaults to percent mode when pricingMode is not provided', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [], groups: [] })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

    const formData = new FormData()
    formData.set('productId', 'gid://shopify/Product/111')
    formData.set('tier-0-minQty', '5')
    formData.set('tier-0-percentOff', '10')

    await createDiscount(formData)

    expect(saveSpy).toHaveBeenCalledWith({
      products: [{ productId: 'gid://shopify/Product/111', status: 'draft', pricingMode: 'percent', tiers: [{ minQty: 5, percentOff: 10 }] }],
      groups: [],
    })
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
      products: [{ productId: 'gid://shopify/Product/111', status: 'draft', pricingMode: 'percent', tiers: [] }],
      groups: [],
    })
    const formData = new FormData()
    formData.set('productId', 'gid://shopify/Product/111')
    formData.set('tier-0-minQty', '5')
    formData.set('tier-0-percentOff', '10')
    await expect(createDiscount(formData)).rejects.toThrow('already has a discount or belongs to a group')
  })

  it('rejects a product that already belongs to a group', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'A', status: 'draft', pricingMode: 'percent', productIds: ['gid://shopify/Product/1'], tiers: [] }],
    })
    const formData = new FormData()
    formData.set('productId', 'gid://shopify/Product/1')
    formData.set('tier-0-minQty', '5')
    formData.set('tier-0-percentOff', '10')
    await expect(createDiscount(formData)).rejects.toThrow('already has a discount or belongs to a group')
  })

  it('preserves existing groups when saving a new standalone discount', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'A', status: 'live', pricingMode: 'percent', productIds: ['gid://shopify/Product/9'], tiers: [] }],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

    const formData = new FormData()
    formData.set('productId', 'gid://shopify/Product/111')
    formData.set('tier-0-minQty', '5')
    formData.set('tier-0-percentOff', '10')

    await createDiscount(formData)

    expect(saveSpy).toHaveBeenCalledWith({
      products: [{ productId: 'gid://shopify/Product/111', status: 'draft', pricingMode: 'percent', tiers: [{ minQty: 5, percentOff: 10 }] }],
      groups: [{ groupId: 'grp_a', name: 'A', status: 'live', pricingMode: 'percent', productIds: ['gid://shopify/Product/9'], tiers: [] }],
    })
  })
})

describe('updateTiers', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('replaces the tiers for an existing product', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [{ productId: 'gid://shopify/Product/111', status: 'live', pricingMode: 'percent', tiers: [{ minQty: 5, percentOff: 10 }] }],
      groups: [],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(productTiers, 'syncProductTierMetafield').mockResolvedValue()

    const formData = new FormData()
    formData.set('tier-0-minQty', '3')
    formData.set('tier-0-percentOff', '5')
    formData.set('tier-1-minQty', '8')
    formData.set('tier-1-percentOff', '12')

    await updateTiers('gid://shopify/Product/111', formData)

    expect(saveSpy).toHaveBeenCalledWith({
      products: [{
        productId: 'gid://shopify/Product/111',
        status: 'live', pricingMode: 'percent',
        tiers: [{ minQty: 3, percentOff: 5 }, { minQty: 8, percentOff: 12 }],
      }],
      groups: [],
    })
  })

  it('throws when the product has no existing discount', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [], groups: [] })
    const formData = new FormData()
    formData.set('tier-0-minQty', '5')
    formData.set('tier-0-percentOff', '10')
    await expect(updateTiers('gid://shopify/Product/999', formData)).rejects.toThrow('not found')
  })

  it('re-syncs the per-product metafield when the discount is already live', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [{ productId: 'gid://shopify/Product/111', status: 'live', pricingMode: 'percent', tiers: [{ minQty: 5, percentOff: 10 }] }],
      groups: [],
    })
    vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    const syncSpy = vi.spyOn(productTiers, 'syncProductTierMetafield').mockResolvedValue()

    const formData = new FormData()
    formData.set('tier-0-minQty', '3')
    formData.set('tier-0-percentOff', '5')

    await updateTiers('gid://shopify/Product/111', formData)

    expect(syncSpy).toHaveBeenCalledWith('gid://shopify/Product/111', [{ minQty: 3, percentOff: 5 }])
  })

  it('does not sync the per-product metafield when the discount is still draft', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [{ productId: 'gid://shopify/Product/111', status: 'draft', pricingMode: 'percent', tiers: [{ minQty: 5, percentOff: 10 }] }],
      groups: [],
    })
    vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    const syncSpy = vi.spyOn(productTiers, 'syncProductTierMetafield').mockResolvedValue()

    const formData = new FormData()
    formData.set('tier-0-minQty', '3')
    formData.set('tier-0-percentOff', '5')

    await updateTiers('gid://shopify/Product/111', formData)

    expect(syncSpy).not.toHaveBeenCalled()
  })

  it('parses fixed-price tiers when the stored discount is fixed mode', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [{ productId: 'gid://shopify/Product/111', status: 'live', pricingMode: 'fixed', tiers: [{ minQty: 1, fixedPrice: 2.00 }] }],
      groups: [],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(productTiers, 'syncProductTierMetafield').mockResolvedValue()

    const formData = new FormData()
    formData.set('tier-0-minQty', '1')
    formData.set('tier-0-fixedPrice', '1.70')
    formData.set('tier-1-minQty', '3')
    formData.set('tier-1-fixedPrice', '1.50')

    await updateTiers('gid://shopify/Product/111', formData)

    expect(saveSpy).toHaveBeenCalledWith({
      products: [{
        productId: 'gid://shopify/Product/111',
        status: 'live',
        pricingMode: 'fixed',
        tiers: [
          { minQty: 1, fixedPrice: 1.70 },
          { minQty: 3, fixedPrice: 1.50 },
        ],
      }],
      groups: [],
    })
  })

  it('ignores a pricingMode field in the form when updating tiers — mode is locked to the stored value', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [{ productId: 'gid://shopify/Product/111', status: 'live', pricingMode: 'percent', tiers: [{ minQty: 5, percentOff: 10 }] }],
      groups: [],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(productTiers, 'syncProductTierMetafield').mockResolvedValue()

    const formData = new FormData()
    formData.set('pricingMode', 'fixed')
    formData.set('tier-0-minQty', '7')
    formData.set('tier-0-percentOff', '20')

    await updateTiers('gid://shopify/Product/111', formData)

    expect(saveSpy).toHaveBeenCalledWith({
      products: [{ productId: 'gid://shopify/Product/111', status: 'live', pricingMode: 'percent', tiers: [{ minQty: 7, percentOff: 20 }] }],
      groups: [],
    })
  })
})

describe('setStatus', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('flips a product discount to live', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [{ productId: 'gid://shopify/Product/111', status: 'draft', pricingMode: 'percent', tiers: [{ minQty: 5, percentOff: 10 }] }],
      groups: [],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(productTiers, 'syncProductTierMetafield').mockResolvedValue()

    await setStatus('gid://shopify/Product/111', 'live')

    expect(saveSpy).toHaveBeenCalledWith({
      products: [{ productId: 'gid://shopify/Product/111', status: 'live', pricingMode: 'percent', tiers: [{ minQty: 5, percentOff: 10 }] }],
      groups: [],
    })
  })

  it('writes the per-product metafield when flipping to live', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [{ productId: 'gid://shopify/Product/111', status: 'draft', pricingMode: 'percent', tiers: [{ minQty: 5, percentOff: 10 }] }],
      groups: [],
    })
    vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    const syncSpy = vi.spyOn(productTiers, 'syncProductTierMetafield').mockResolvedValue()

    await setStatus('gid://shopify/Product/111', 'live')

    expect(syncSpy).toHaveBeenCalledWith('gid://shopify/Product/111', [{ minQty: 5, percentOff: 10 }])
  })

  it('deletes the per-product metafield when flipping to draft', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [{ productId: 'gid://shopify/Product/111', status: 'live', pricingMode: 'percent', tiers: [{ minQty: 5, percentOff: 10 }] }],
      groups: [],
    })
    vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    const syncSpy = vi.spyOn(productTiers, 'syncProductTierMetafield').mockResolvedValue()

    await setStatus('gid://shopify/Product/111', 'draft')

    expect(syncSpy).toHaveBeenCalledWith('gid://shopify/Product/111', null)
  })
})

describe('deleteDiscount', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('removes the product entirely from config', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [
        { productId: 'gid://shopify/Product/111', status: 'live', pricingMode: 'percent', tiers: [] },
        { productId: 'gid://shopify/Product/222', status: 'draft', pricingMode: 'percent', tiers: [] },
      ],
      groups: [],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(productTiers, 'syncProductTierMetafield').mockResolvedValue()

    await deleteDiscount('gid://shopify/Product/111')

    expect(saveSpy).toHaveBeenCalledWith({
      products: [{ productId: 'gid://shopify/Product/222', status: 'draft', pricingMode: 'percent', tiers: [] }],
      groups: [],
    })
  })

  it('deletes the per-product metafield', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [{ productId: 'gid://shopify/Product/111', status: 'live', pricingMode: 'percent', tiers: [] }],
      groups: [],
    })
    vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    const syncSpy = vi.spyOn(productTiers, 'syncProductTierMetafield').mockResolvedValue()

    await deleteDiscount('gid://shopify/Product/111')

    expect(syncSpy).toHaveBeenCalledWith('gid://shopify/Product/111', null)
  })

  it('preserves existing groups when deleting a standalone discount', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [{ productId: 'gid://shopify/Product/111', status: 'live', pricingMode: 'percent', tiers: [] }],
      groups: [{ groupId: 'grp_a', name: 'A', status: 'live', pricingMode: 'percent', productIds: ['gid://shopify/Product/9'], tiers: [] }],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(productTiers, 'syncProductTierMetafield').mockResolvedValue()

    await deleteDiscount('gid://shopify/Product/111')

    expect(saveSpy).toHaveBeenCalledWith({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'A', status: 'live', pricingMode: 'percent', productIds: ['gid://shopify/Product/9'], tiers: [] }],
    })
  })
})

describe('createGroup', () => {
  beforeEach(() => vi.restoreAllMocks())

  function formWithProducts(ids: string[]): FormData {
    const formData = new FormData()
    ids.forEach((id, i) => formData.set(`product-${i}-id`, id))
    return formData
  }

  it('creates a draft group with parsed tiers and products', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [], groups: [] })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-1111-1111-111111111111')

    const formData = formWithProducts(['gid://shopify/Product/1', 'gid://shopify/Product/2'])
    formData.set('name', 'Mix & Match Soups')
    formData.set('tier-0-minQty', '7')
    formData.set('tier-0-percentOff', '10')

    await createGroup(formData)

    expect(saveSpy).toHaveBeenCalledWith({
      products: [],
      groups: [
        {
          groupId: 'grp_11111111-1111-1111-1111-111111111111',
          name: 'Mix & Match Soups',
          status: 'draft', pricingMode: 'percent',
          productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'],
          tiers: [{ minQty: 7, percentOff: 10 }],
        },
      ],
    })
    expect(authRedirect.redirectWithToken).toHaveBeenCalledWith(
      '/discounts/groups/grp_11111111-1111-1111-1111-111111111111',
    )
  })

  it('throws when the name is blank', async () => {
    const formData = formWithProducts(['gid://shopify/Product/1', 'gid://shopify/Product/2'])
    formData.set('tier-0-minQty', '7')
    formData.set('tier-0-percentOff', '10')
    await expect(createGroup(formData)).rejects.toThrow('A group name is required')
  })

  it('throws when fewer than 2 products are provided', async () => {
    const formData = formWithProducts(['gid://shopify/Product/1'])
    formData.set('name', 'Solo')
    formData.set('tier-0-minQty', '7')
    formData.set('tier-0-percentOff', '10')
    await expect(createGroup(formData)).rejects.toThrow('at least 2 products')
  })

  it('throws when no valid tier is provided', async () => {
    const formData = formWithProducts(['gid://shopify/Product/1', 'gid://shopify/Product/2'])
    formData.set('name', 'Soups')
    await expect(createGroup(formData)).rejects.toThrow('At least one tier is required')
  })

  it('throws when a product already has a standalone discount', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [{ productId: 'gid://shopify/Product/1', status: 'draft', pricingMode: 'percent', tiers: [] }],
      groups: [],
    })
    const formData = formWithProducts(['gid://shopify/Product/1', 'gid://shopify/Product/2'])
    formData.set('name', 'Soups')
    formData.set('tier-0-minQty', '7')
    formData.set('tier-0-percentOff', '10')
    await expect(createGroup(formData)).rejects.toThrow('already has a discount or belongs to another group')
  })

  it('throws when a product already belongs to another group', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_other', name: 'Other', status: 'draft', pricingMode: 'percent', productIds: ['gid://shopify/Product/2'], tiers: [] }],
    })
    const formData = formWithProducts(['gid://shopify/Product/1', 'gid://shopify/Product/2'])
    formData.set('name', 'Soups')
    formData.set('tier-0-minQty', '7')
    formData.set('tier-0-percentOff', '10')
    await expect(createGroup(formData)).rejects.toThrow('already has a discount or belongs to another group')
  })

  it('dedupes a product id submitted more than once in the form', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [], groups: [] })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('22222222-2222-2222-2222-222222222222')

    const formData = formWithProducts([
      'gid://shopify/Product/1',
      'gid://shopify/Product/1',
      'gid://shopify/Product/2',
    ])
    formData.set('name', 'Soups')
    formData.set('tier-0-minQty', '7')
    formData.set('tier-0-percentOff', '10')

    await createGroup(formData)

    expect(saveSpy).toHaveBeenCalledWith({
      products: [],
      groups: [
        {
          groupId: 'grp_22222222-2222-2222-2222-222222222222',
          name: 'Soups',
          status: 'draft', pricingMode: 'percent',
          productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'],
          tiers: [{ minQty: 7, percentOff: 10 }],
        },
      ],
    })
  })
})

describe('updateGroupTiers', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('replaces the tiers for an existing group', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'draft', pricingMode: 'percent', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [{ minQty: 5, percentOff: 10 }] }],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

    const formData = new FormData()
    formData.set('tier-0-minQty', '3')
    formData.set('tier-0-percentOff', '5')

    await updateGroupTiers('grp_a', formData)

    expect(saveSpy).toHaveBeenCalledWith({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'draft', pricingMode: 'percent', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [{ minQty: 3, percentOff: 5 }] }],
    })
  })

  it('throws when the group does not exist', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [], groups: [] })
    const formData = new FormData()
    formData.set('tier-0-minQty', '5')
    formData.set('tier-0-percentOff', '10')
    await expect(updateGroupTiers('grp_missing', formData)).rejects.toThrow('not found')
  })

  it('re-syncs every member metafield when the group is live', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'live', pricingMode: 'percent', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [{ minQty: 5, percentOff: 10 }] }],
    })
    vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(products, 'getGroupProductInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', title: 'Tuna', handle: 'tuna', basePrice: 1.49 },
      { productId: 'gid://shopify/Product/2', title: 'Chicken', handle: 'chicken', basePrice: 1.49 },
    ])
    const syncSpy = vi.spyOn(productTiers, 'syncGroupTierMetafield').mockResolvedValue()

    const formData = new FormData()
    formData.set('tier-0-minQty', '3')
    formData.set('tier-0-percentOff', '5')

    await updateGroupTiers('grp_a', formData)

    expect(syncSpy).toHaveBeenCalledWith('gid://shopify/Product/1', {
      tiers: [{ minQty: 3, percentOff: 5 }],
      siblings: [{ title: 'Chicken', handle: 'chicken' }],
    })
    expect(syncSpy).toHaveBeenCalledWith('gid://shopify/Product/2', {
      tiers: [{ minQty: 3, percentOff: 5 }],
      siblings: [{ title: 'Tuna', handle: 'tuna' }],
    })
  })

  it('does not sync metafields when the group is still draft', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'draft', pricingMode: 'percent', productIds: ['gid://shopify/Product/1'], tiers: [{ minQty: 5, percentOff: 10 }] }],
    })
    vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    const syncSpy = vi.spyOn(productTiers, 'syncGroupTierMetafield').mockResolvedValue()

    const formData = new FormData()
    formData.set('tier-0-minQty', '3')
    formData.set('tier-0-percentOff', '5')

    await updateGroupTiers('grp_a', formData)

    expect(syncSpy).not.toHaveBeenCalled()
  })
})

describe('updateGroupProducts', () => {
  beforeEach(() => vi.restoreAllMocks())

  function formWithProducts(ids: string[]): FormData {
    const formData = new FormData()
    ids.forEach((id, i) => formData.set(`product-${i}-id`, id))
    return formData
  }

  it('replaces the product list for a draft group', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'draft', pricingMode: 'percent', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [] }],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

    await updateGroupProducts('grp_a', formWithProducts(['gid://shopify/Product/1', 'gid://shopify/Product/3']))

    expect(saveSpy).toHaveBeenCalledWith({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'draft', pricingMode: 'percent', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/3'], tiers: [] }],
    })
  })

  it('throws when fewer than 2 products are provided', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'draft', pricingMode: 'percent', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [] }],
    })
    await expect(updateGroupProducts('grp_a', formWithProducts(['gid://shopify/Product/1']))).rejects.toThrow(
      'at least 2 products',
    )
  })

  it('allows re-submitting the group\'s own current members without a membership conflict', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'draft', pricingMode: 'percent', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [] }],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()

    await updateGroupProducts('grp_a', formWithProducts(['gid://shopify/Product/1', 'gid://shopify/Product/2']))

    expect(saveSpy).toHaveBeenCalled()
  })

  it('clears metafields from products removed from a live group', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'live', pricingMode: 'percent', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [{ minQty: 5, percentOff: 10 }] }],
    })
    vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(products, 'getGroupProductInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', title: 'Tuna', handle: 'tuna', basePrice: 1.49 },
      { productId: 'gid://shopify/Product/3', title: 'Ocean', handle: 'ocean', basePrice: 1.49 },
    ])
    const syncSpy = vi.spyOn(productTiers, 'syncGroupTierMetafield').mockResolvedValue()

    await updateGroupProducts('grp_a', formWithProducts(['gid://shopify/Product/1', 'gid://shopify/Product/3']))

    expect(syncSpy).toHaveBeenCalledWith('gid://shopify/Product/2', null)
  })
})

describe('setGroupStatus', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('writes metafields to every member when flipping to live', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'draft', pricingMode: 'percent', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [{ minQty: 5, percentOff: 10 }] }],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    vi.spyOn(products, 'getGroupProductInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', title: 'Tuna', handle: 'tuna', basePrice: 1.49 },
      { productId: 'gid://shopify/Product/2', title: 'Chicken', handle: 'chicken', basePrice: 1.49 },
    ])
    const syncSpy = vi.spyOn(productTiers, 'syncGroupTierMetafield').mockResolvedValue()

    await setGroupStatus('grp_a', 'live')

    expect(saveSpy).toHaveBeenCalledWith({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'live', pricingMode: 'percent', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [{ minQty: 5, percentOff: 10 }] }],
    })
    expect(syncSpy).toHaveBeenCalledTimes(2)
  })

  it('clears metafields from every member when flipping to draft', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [{ groupId: 'grp_a', name: 'Soups', status: 'live', pricingMode: 'percent', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [] }],
    })
    vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    const syncSpy = vi.spyOn(productTiers, 'syncGroupTierMetafield').mockResolvedValue()

    await setGroupStatus('grp_a', 'draft')

    expect(syncSpy).toHaveBeenCalledWith('gid://shopify/Product/1', null)
    expect(syncSpy).toHaveBeenCalledWith('gid://shopify/Product/2', null)
  })
})

describe('deleteGroup', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('removes the group and clears every member metafield', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      products: [],
      groups: [
        { groupId: 'grp_a', name: 'Soups', status: 'live', pricingMode: 'percent', productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tiers: [] },
        { groupId: 'grp_b', name: 'Other', status: 'draft', pricingMode: 'percent', productIds: ['gid://shopify/Product/9'], tiers: [] },
      ],
    })
    const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
    const syncSpy = vi.spyOn(productTiers, 'syncGroupTierMetafield').mockResolvedValue()

    await deleteGroup('grp_a')

    expect(saveSpy).toHaveBeenCalledWith({
      products: [],
      groups: [{ groupId: 'grp_b', name: 'Other', status: 'draft', pricingMode: 'percent', productIds: ['gid://shopify/Product/9'], tiers: [] }],
    })
    expect(syncSpy).toHaveBeenCalledWith('gid://shopify/Product/1', null)
    expect(syncSpy).toHaveBeenCalledWith('gid://shopify/Product/2', null)
  })

  it('throws when the group does not exist', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ products: [], groups: [] })
    await expect(deleteGroup('grp_missing')).rejects.toThrow('not found')
  })
})
