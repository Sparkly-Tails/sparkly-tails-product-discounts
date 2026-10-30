import { describe, it, expect } from 'vitest'
import { groupMembersByProduct, describeProductCount, describeGroup, removeProductMembers, type SelectedMember } from '@/form/memberSelection'

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
