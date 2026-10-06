import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest'
import { resolveGroup, loadCovered } from '@/timeDiscounts/groupServer'
import * as collectionsLib from '@/lib/collections'
import * as productsLib from '@/lib/products'
import * as configLib from '@/lib/config'
import * as timeConfigLib from '@/timeDiscounts/config'
import { EMPTY_SELECTION_MESSAGE, groupSizeMessage } from '@/timeDiscounts/group'
import type { GroupSpec, TimeDiscount } from '@/timeDiscounts/config'

const P1 = 'gid://shopify/Product/1'
const P2 = 'gid://shopify/Product/2'
const V10 = 'gid://shopify/ProductVariant/10'
const C1 = 'gid://shopify/Collection/1'
const BASE = 'https://shop.myshopify.com/admin/products/'

const products = (...members: { productId: string; variantId?: string; title: string }[]): GroupSpec['selection'] => ({ mode: 'products', members })
const group = (selection: GroupSpec['selection'], over: Partial<GroupSpec> = {}): GroupSpec => ({ pricingMode: 'percent', amount: 20, selection, ...over })
const lowest = (productId: string, title: string, price: number) => ({ productId, title, price })
const info = (productId: string, variantId: string, title: string, price: number) => ({ productId, variantId, title, price, handle: 'h', imageUrl: null })
const otherDiscount = (productId: string): TimeDiscount => ({
  discountId: 'time_disc_9', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/9', name: 'Other', title: 'Other', kind: 'perProduct',
  startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00', items: [{ productId, pricingMode: 'percent', amount: 10 }],
})

let getMemberInfo: MockInstance<typeof productsLib.getMemberInfo>
let getLowest: MockInstance<typeof productsLib.getLowestVariantPrices>
let resolveCollection: MockInstance<typeof collectionsLib.resolveCollectionMembers>

beforeEach(() => {
  vi.restoreAllMocks()
  getMemberInfo = vi.spyOn(productsLib, 'getMemberInfo').mockResolvedValue([])
  getLowest = vi.spyOn(productsLib, 'getLowestVariantPrices').mockResolvedValue([lowest(P1, 'Cat Toy', 10), lowest(P2, 'Dog Bed', 40)])
  resolveCollection = vi.spyOn(collectionsLib, 'resolveCollectionMembers').mockResolvedValue([{ productId: P1 }, { productId: P2 }])
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })
  vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [] })
})

describe('resolveGroup — products mode', () => {
  it('turns the picks into rows with the shared rule, and prices variants and whole products separately', async () => {
    getMemberInfo.mockResolvedValue([info(P2, V10, 'Dog Bed – Grey', 60)])
    const result = await resolveGroup(group(products({ productId: P1, title: 'Cat Toy' }, { productId: P2, variantId: V10, title: 'Dog Bed – Grey' })), undefined, BASE)

    expect(result.items).toEqual([
      { productId: P1, pricingMode: 'percent', amount: 20 },
      { productId: P2, variantId: V10, pricingMode: 'percent', amount: 20 },
    ])
    expect(result.covered).toEqual([
      { productId: P1, title: 'Cat Toy', adminUrl: `${BASE}1`, regularPrice: 10, discountedPrice: 8 },
      { productId: P2, variantId: V10, title: 'Dog Bed – Grey', adminUrl: `${BASE}2`, regularPrice: 60, discountedPrice: 48 },
    ])
    expect(getMemberInfo).toHaveBeenCalledWith([{ productId: P2, variantId: V10 }])
    expect(getLowest).toHaveBeenCalledWith([P1])
  })
})

describe('resolveGroup — collections mode', () => {
  const inCollection = group({ mode: 'collections', collections: [{ id: C1, title: 'Summer' }] })

  it('resolves the collection to whole-product rows, asking for at most one more than the limit', async () => {
    const result = await resolveGroup(inCollection, undefined, BASE)
    expect(resolveCollection).toHaveBeenCalledWith([C1], 201)
    expect(result.items).toEqual([{ productId: P1, pricingMode: 'percent', amount: 20 }, { productId: P2, pricingMode: 'percent', amount: 20 }])
  })

  it('refuses a collection with no products', async () => {
    resolveCollection.mockResolvedValue([])
    await expect(resolveGroup(inCollection, undefined, BASE)).rejects.toThrow(EMPTY_SELECTION_MESSAGE)
  })

  it('refuses a collection over the limit before looking up any price', async () => {
    resolveCollection.mockResolvedValue(Array.from({ length: 201 }, (_, i) => ({ productId: `gid://shopify/Product/${i}` })))
    await expect(resolveGroup(inCollection, undefined, BASE)).rejects.toThrow(groupSizeMessage(201, true))
    expect(getLowest).not.toHaveBeenCalled()
    expect(getMemberInfo).not.toHaveBeenCalled()
  })

  it('refuses rows that would not fit the checkout config, with the real count', async () => {
    resolveCollection.mockResolvedValue(Array.from({ length: 150 }, (_, i) => ({ productId: `gid://shopify/Product/${1000 + i}` })))
    await expect(resolveGroup(inCollection, undefined, BASE)).rejects.toThrow(groupSizeMessage(150, false))
    expect(getLowest).not.toHaveBeenCalled()
  })

  it('makes no collection lookup when no collection is picked', async () => {
    await expect(resolveGroup(group({ mode: 'collections', collections: [] }), undefined, BASE)).rejects.toThrow(EMPTY_SELECTION_MESSAGE)
    expect(resolveCollection).not.toHaveBeenCalled()
  })
})

describe('resolveGroup — empty picks', () => {
  it('throws for an empty selection, unless empty is allowed (an existing group whose picks were all removed)', async () => {
    const empty = group(products())
    await expect(resolveGroup(empty, undefined, BASE)).rejects.toThrow(EMPTY_SELECTION_MESSAGE)
    expect(await resolveGroup(empty, undefined, BASE, { allowEmpty: true })).toEqual({ items: [], covered: [] })
  })

  it('still checks the rule when empty is allowed', async () => {
    await expect(resolveGroup(group(products(), { amount: 0 }), undefined, BASE, { allowEmpty: true })).rejects.toThrow('Enter an amount greater than zero')
  })
})

describe('resolveGroup — the rule', () => {
  it('refuses an invalid rule before looking anything up', async () => {
    await expect(resolveGroup(group(products({ productId: P1, title: 'Cat Toy' }), { amount: 150 }), undefined, BASE)).rejects.toThrow('A percentage discount cannot exceed 100%')
    expect(getLowest).not.toHaveBeenCalled()
  })

  it('judges a fixed price against the CHEAPEST variant of a whole product', async () => {
    getLowest.mockResolvedValue([lowest(P1, 'Bed', 24.5)])
    const fixed30 = group(products({ productId: P1, title: 'Bed' }), { pricingMode: 'fixed', amount: 30 })
    await expect(resolveGroup(fixed30, undefined, BASE)).rejects.toThrow(/^Bed: The fixed price \(£30\.00\) is not lower than the regular price \(£24\.50\)/)
  })

  it('accepts a fixed price below the cheapest variant', async () => {
    getLowest.mockResolvedValue([lowest(P1, 'Bed', 24.5)])
    const fixed20 = group(products({ productId: P1, title: 'Bed' }), { pricingMode: 'fixed', amount: 20 })
    expect((await resolveGroup(fixed20, undefined, BASE)).covered[0]).toMatchObject({ regularPrice: 24.5, discountedPrice: 20 })
  })

  it('names the first failing product and counts the others', async () => {
    const fixed = group(products({ productId: P1, title: 'Cat Toy' }, { productId: P2, title: 'Dog Bed' }), { pricingMode: 'fixed', amount: 50 })
    await expect(resolveGroup(fixed, undefined, BASE)).rejects.toThrow(/^Cat Toy: .*\(and 1 more product with a problem\)$/)
  })

  it('reports a product that is no longer in Shopify', async () => {
    getLowest.mockResolvedValue([])
    await expect(resolveGroup(group(products({ productId: P1, title: 'Cat Toy' })), undefined, BASE)).rejects.toThrow('Product 1: This product could not be found in Shopify')
  })
})

describe('resolveGroup — availability', () => {
  const pick = group(products({ productId: P1, title: 'Cat Toy' }))

  it('refuses a product that belongs to another time discount', async () => {
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [otherDiscount(P1)] })
    await expect(resolveGroup(pick, undefined, BASE)).rejects.toThrow('Cat Toy: This product already belongs to another discount')
  })

  it('does not count the group\'s own rows as a conflict', async () => {
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [otherDiscount(P1)] })
    expect((await resolveGroup(pick, 'time_disc_9', BASE)).items).toHaveLength(1)
  })

  it('refuses a product that belongs to a tier discount', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      discounts: [{ discountId: 'tier_1', name: 'Tiers', status: 'active', pricingMode: 'percent', tiers: [], members: [{ productId: P1 }] }],
    } as never)
    await expect(resolveGroup(pick, undefined, BASE)).rejects.toThrow('Cat Toy: This product already belongs to another discount')
  })
})

describe('loadCovered', () => {
  it('shows existing rows with their current prices', async () => {
    getMemberInfo.mockResolvedValue([info(P2, V10, 'Dog Bed – Grey', 60)])
    const rows = await loadCovered([
      { productId: P1, pricingMode: 'fixed', amount: 7.5 },
      { productId: P2, variantId: V10, pricingMode: 'percent', amount: 50 },
    ], BASE)
    expect(rows).toEqual([
      { productId: P1, title: 'Cat Toy', adminUrl: `${BASE}1`, regularPrice: 10, discountedPrice: 7.5 },
      { productId: P2, variantId: V10, title: 'Dog Bed – Grey', adminUrl: `${BASE}2`, regularPrice: 60, discountedPrice: 30 },
    ])
  })

  it('leaves out a product that can no longer be found', async () => {
    getLowest.mockResolvedValue([])
    expect(await loadCovered([{ productId: P1, pricingMode: 'percent', amount: 10 }], BASE)).toEqual([])
  })
})
