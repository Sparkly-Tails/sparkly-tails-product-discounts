import { describe, it, expect } from 'vitest'
import { CLAIM_TOOLS, listLiveTierClaims, findClaim, describePickRefusal, describeSaveRefusal, type Claim } from '@/form/claims'
import type { Discount } from '@/lib/config'

function tierDiscount(overrides: Partial<Discount>): Discount {
  return { discountId: 'disc_a', name: 'Spring', title: 'Spring', status: 'live', pricingMode: 'percent', members: [{ productId: 'p1' }], tiers: [], ...overrides }
}

describe('listLiveTierClaims', () => {
  it('claims the members of a live discount and nothing of a draft', () => {
    const discounts = [tierDiscount({ members: [{ productId: 'p1' }, { productId: 'p2', variantId: 'v2' }] }), tierDiscount({ discountId: 'disc_b', name: 'Draft', status: 'draft' })]
    expect(listLiveTierClaims({ discounts, tools: CLAIM_TOOLS })).toEqual([
      { discountId: 'disc_a', discountName: 'Spring', productId: 'p1', variantId: undefined },
      { discountId: 'disc_a', discountName: 'Spring', productId: 'p2', variantId: 'v2' },
    ])
  })
})

describe('findClaim', () => {
  const claims: Claim[] = [
    { discountId: 'disc_a', discountName: 'Spring', productId: 'p1' },
    { discountId: 'disc_b', discountName: 'Autumn', productId: 'p2', variantId: 'v20' },
  ]

  it('finds the claim on the same product', () => {
    expect(findClaim({ claims, productId: 'p1', variantId: undefined, discountId: undefined, tools: CLAIM_TOOLS })).toBe(claims[0])
  })

  it('lets a whole product match its variant and a variant match the whole product', () => {
    expect(findClaim({ claims, productId: 'p1', variantId: 'v10', discountId: undefined, tools: CLAIM_TOOLS })).toBe(claims[0])
    expect(findClaim({ claims, productId: 'p2', variantId: undefined, discountId: undefined, tools: CLAIM_TOOLS })).toBe(claims[1])
  })

  it('does not match another variant of the same product, or another product', () => {
    expect(findClaim({ claims, productId: 'p2', variantId: 'v21', discountId: undefined, tools: CLAIM_TOOLS })).toBeUndefined()
    expect(findClaim({ claims, productId: 'p3', variantId: undefined, discountId: undefined, tools: CLAIM_TOOLS })).toBeUndefined()
  })

  it('skips the claims of the discount being edited', () => {
    expect(findClaim({ claims, productId: 'p1', variantId: undefined, discountId: 'disc_a', tools: CLAIM_TOOLS })).toBeUndefined()
  })
})

describe('refusal messages', () => {
  const tier: Claim = { discountId: 'disc_a', discountName: 'Spring', productId: 'p1' }

  it('tells the picker which discount already has the product or the variant', () => {
    expect(describePickRefusal({ claim: tier, isVariant: false })).toBe('Product already in discount "Spring"')
    expect(describePickRefusal({ claim: tier, isVariant: true })).toBe('Variant already in discount "Spring"')
  })

  it('tells a save which live discount has the product and what to do', () => {
    expect(describeSaveRefusal({ claim: tier, memberTitle: 'Tuna Soup' })).toBe(
      '"Tuna Soup" is already in live discount "Spring". A product can only be in one live discount: take "Spring" offline or remove the product here.',
    )
  })
})
