import { describe, it, expect } from 'vitest'
import {
  groupMembersByProduct, describeProductCount, describeGroup, removeProductMembers, isMemberSelected, addMemberOnce,
  countMembersOfProduct, isProductFullySelected, keepUnselectedProducts, keepUnselectedVariants, type SelectedMember,
} from '@/form/memberSelection'

const SALMON: SelectedMember = { productId: 'p1', productTitle: 'Wild Alaskan Salmon Oil for Dogs', variantId: 'v1', variantTitle: '16 fl oz', price: 28, imageUrl: 'https://cdn.example/salmon.png' }
const CHEWS_90: SelectedMember = { productId: 'p2', productTitle: 'Canine Vitality Joint Support Chews', variantId: 'v2', variantTitle: '90 Chews', price: 32, imageUrl: null }
const CHEWS_180: SelectedMember = { productId: 'p2', productTitle: 'Canine Vitality Joint Support Chews', variantId: 'v3', variantTitle: '180 Chews', price: 58, imageUrl: null }
const formatPrice = (amount: number) => '$' + amount.toFixed(2)

describe('groupMembersByProduct', () => {
  it('puts the variants of one product in one group, in the order the products were added', () => {
    const groups = groupMembersByProduct({ members: [SALMON, CHEWS_90, CHEWS_180] })
    expect(groups).toEqual([
      { productId: 'p1', productTitle: 'Wild Alaskan Salmon Oil for Dogs', imageUrl: 'https://cdn.example/salmon.png', variantTitles: ['16 fl oz'], prices: [28] },
      { productId: 'p2', productTitle: 'Canine Vitality Joint Support Chews', imageUrl: null, variantTitles: ['90 Chews', '180 Chews'], prices: [32, 58] },
    ])
  })

  it('has no variant title for a whole product', () => {
    const whole: SelectedMember = { productId: 'p3', productTitle: 'Tuna Soup', price: 1.5, imageUrl: null }
    expect(groupMembersByProduct({ members: [whole] })[0].variantTitles).toEqual([])
  })

  it('returns no groups for no members', () => {
    expect(groupMembersByProduct({ members: [] })).toEqual([])
  })
})

describe('describeProductCount', () => {
  it.each([
    [0, '0 products selected'],
    [1, '1 product selected'],
    [2, '2 products selected'],
  ])('says %i as "%s"', (productCount, text) => {
    expect(describeProductCount({ productCount })).toBe(text)
  })
})

describe('describeGroup', () => {
  it('describes one variant with its title and price', () => {
    const [group] = groupMembersByProduct({ members: [SALMON] })
    expect(describeGroup({ group, currencyCode: 'USD', formatPrice })).toBe('1 variant selected • 16 fl oz • $28.00 USD')
  })

  it('describes several variants with the price range', () => {
    const [group] = groupMembersByProduct({ members: [CHEWS_90, CHEWS_180] })
    expect(describeGroup({ group, currencyCode: 'USD', formatPrice })).toBe('2 variants selected • 90 Chews, 180 Chews • $32.00–$58.00 USD')
  })

  it('shows one price when the variants cost the same', () => {
    const [group] = groupMembersByProduct({ members: [CHEWS_90, { ...CHEWS_180, price: 32 }] })
    expect(describeGroup({ group, currencyCode: 'USD', formatPrice })).toBe('2 variants selected • 90 Chews, 180 Chews • $32.00 USD')
  })

  it('leaves the variant titles out for a whole product', () => {
    const [group] = groupMembersByProduct({ members: [{ productId: 'p3', productTitle: 'Tuna Soup', price: 1.5, imageUrl: null }] })
    expect(describeGroup({ group, currencyCode: 'GBP', formatPrice })).toBe('1 variant selected • $1.50 GBP')
  })
})

describe('removeProductMembers', () => {
  it('removes every variant of the product and nothing else', () => {
    expect(removeProductMembers({ members: [SALMON, CHEWS_90, CHEWS_180], productId: 'p2' })).toEqual([SALMON])
  })

  it('leaves the members alone when the product is not selected', () => {
    expect(removeProductMembers({ members: [SALMON], productId: 'p9' })).toEqual([SALMON])
  })
})

describe('isMemberSelected', () => {
  it('finds a variant by product and variant', () => {
    expect(isMemberSelected({ members: [SALMON, CHEWS_90], productId: 'p2', variantId: 'v2' })).toBe(true)
  })

  it('does not mix up two variants of one product', () => {
    expect(isMemberSelected({ members: [CHEWS_90], productId: 'p2', variantId: 'v3' })).toBe(false)
  })

  it('finds a whole product, which has no variant', () => {
    const whole: SelectedMember = { productId: 'p3', productTitle: 'Tuna Soup', price: 1.5, imageUrl: null }
    expect(isMemberSelected({ members: [whole], productId: 'p3', variantId: undefined })).toBe(true)
    expect(isMemberSelected({ members: [whole], productId: 'p3', variantId: 'v9' })).toBe(false)
  })
})

describe('addMemberOnce', () => {
  it('adds a member at the end', () => {
    expect(addMemberOnce({ members: [SALMON], member: CHEWS_90 })).toEqual([SALMON, CHEWS_90])
  })

  it('does not add the same member twice', () => {
    expect(addMemberOnce({ members: [SALMON], member: SALMON })).toEqual([SALMON])
  })
})

describe('countMembersOfProduct', () => {
  it('counts the variants chosen for one product', () => {
    expect(countMembersOfProduct({ members: [SALMON, CHEWS_90, CHEWS_180], productId: 'p2' })).toBe(2)
    expect(countMembersOfProduct({ members: [SALMON], productId: 'p9' })).toBe(0)
  })
})

describe('isProductFullySelected', () => {
  it.each([
    [1, 1, true],
    [1, 0, false],
    [3, 2, false],
    [3, 3, true],
    [0, 0, false],
  ])('with %i variants and %i selected is %s', (variantCount, selectedCount, expected) => {
    expect(isProductFullySelected({ variantCount, selectedCount })).toBe(expected)
  })
})

describe('keepUnselectedProducts', () => {
  const tools = { countMembersOfProduct, isProductFullySelected }
  const results = [
    { id: 'p1', title: 'Salmon', variantCount: 1, imageUrl: null },
    { id: 'p2', title: 'Chews', variantCount: 2, imageUrl: null },
    { id: 'p4', title: 'Treats', variantCount: 1, imageUrl: null },
  ]

  it('drops a single-variant product that is chosen and a product whose variants are all chosen', () => {
    const members = [SALMON, CHEWS_90, CHEWS_180]
    expect(keepUnselectedProducts({ results, members, tools }).map((result) => result.id)).toEqual(['p4'])
  })

  it('keeps a product with variants still to choose', () => {
    expect(keepUnselectedProducts({ results, members: [CHEWS_90], tools }).map((result) => result.id)).toEqual(['p1', 'p2', 'p4'])
  })
})

describe('keepUnselectedVariants', () => {
  it('drops the variants that are already chosen', () => {
    const options = [{ variantId: 'v2', title: '90 Chews', price: 32 }, { variantId: 'v3', title: '180 Chews', price: 58 }]
    expect(keepUnselectedVariants({ options, members: [CHEWS_90], productId: 'p2', tools: { isMemberSelected } })).toEqual([options[1]])
  })
})
