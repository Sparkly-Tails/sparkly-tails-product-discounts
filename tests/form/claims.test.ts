import { describe, it, expect, vi } from 'vitest'
import { CLAIM_TOOLS, listLiveTierClaims, listOpenTimeClaims, findClaim, describePickRefusal, describeSaveRefusal, type Claim } from '@/form/claims'
import type { Discount } from '@/lib/config'
import type { TimeDiscount } from '@/timeDiscounts/config'

function tierDiscount(overrides: Partial<Discount>): Discount {
  return { discountId: 'disc_a', name: 'Spring', title: 'Spring', status: 'live', pricingMode: 'percent', members: [{ productId: 'p1' }], tiers: [], ...overrides }
}
function timeDiscount(overrides: Partial<TimeDiscount>): TimeDiscount {
  return {
    discountId: 'time_a', shopifyDiscountId: 'gid://shopify/DiscountAutomaticNode/1', name: 'Old', title: 'Weekend sale',
    startsAt: '2026-11-01T09:00', endsAt: '2026-11-02T09:00', kind: 'perProduct', items: [{ productId: 'p1', pricingMode: 'percent', amount: 10 }], ...overrides,
  }
}

describe('listLiveTierClaims', () => {
  it('claims the members of a live discount and nothing of a draft', () => {
    const discounts = [tierDiscount({ members: [{ productId: 'p1' }, { productId: 'p2', variantId: 'v2' }] }), tierDiscount({ discountId: 'disc_b', name: 'Draft', status: 'draft' })]
    expect(listLiveTierClaims({ discounts, tools: CLAIM_TOOLS })).toEqual([
      { kind: 'tier', discountId: 'disc_a', discountName: 'Spring', productId: 'p1', variantId: undefined },
      { kind: 'tier', discountId: 'disc_a', discountName: 'Spring', productId: 'p2', variantId: 'v2' },
    ])
  })
})

describe('listOpenTimeClaims', () => {
  const readStatus = vi.fn((startsAt: string) => (startsAt.startsWith('2026-11') ? 'Upcoming' : startsAt.startsWith('2026-10') ? 'Active' : 'Expired') as 'Upcoming' | 'Active' | 'Expired')
  const upcoming = timeDiscount({ discountId: 'time_upcoming' })
  const running = timeDiscount({ discountId: 'time_running', title: 'Running', startsAt: '2026-10-01T09:00', endsAt: '2026-12-02T09:00', items: [{ productId: 'p2', pricingMode: 'percent', amount: 5 }] })
  const expired = timeDiscount({ discountId: 'time_expired', startsAt: '2026-01-01T09:00', endsAt: '2026-01-02T09:00', items: [{ productId: 'p9', pricingMode: 'percent', amount: 5 }] })

  it('claims the items of a time-based discount that is upcoming or running, under its customer title, and nothing of an expired one', () => {
    expect(listOpenTimeClaims({ discounts: [upcoming, running, expired], timeZone: 'Europe/London', tools: { ...CLAIM_TOOLS, readStatus } })).toEqual([
      { kind: 'time', discountId: 'time_upcoming', discountName: 'Weekend sale', productId: 'p1', variantId: undefined },
      { kind: 'time', discountId: 'time_running', discountName: 'Running', productId: 'p2', variantId: undefined },
    ])
  })

  it('reads each status in the shop time zone', () => {
    listOpenTimeClaims({ discounts: [upcoming], timeZone: 'Europe/London', tools: { ...CLAIM_TOOLS, readStatus } })
    expect(readStatus).toHaveBeenCalledWith('2026-11-01T09:00', '2026-11-02T09:00', 'Europe/London')
  })
})

describe('findClaim', () => {
  const claims: Claim[] = [
    { kind: 'tier', discountId: 'disc_a', discountName: 'Spring', productId: 'p1' },
    { kind: 'tier', discountId: 'disc_b', discountName: 'Autumn', productId: 'p2', variantId: 'v20' },
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
  const tier: Claim = { kind: 'tier', discountId: 'disc_a', discountName: 'Spring', productId: 'p1' }
  const time: Claim = { kind: 'time', discountId: 'time_a', discountName: 'Weekend sale', productId: 'p1' }

  it('tells the picker which discount already has the product or the variant', () => {
    expect(describePickRefusal({ claim: tier, isVariant: false })).toBe('Product already in discount "Spring"')
    expect(describePickRefusal({ claim: tier, isVariant: true })).toBe('Variant already in discount "Spring"')
  })

  it('tells a save which live discount has the product and what to do', () => {
    expect(describeSaveRefusal({ claim: tier, memberTitle: 'Tuna Soup' })).toBe(
      '"Tuna Soup" is already in live discount "Spring". A product can only be in one live discount: take "Spring" offline or remove the product here.',
    )
  })

  it('tells a flash sale which upcoming or running time-based discount has the product', () => {
    expect(describeSaveRefusal({ claim: time, memberTitle: 'Tuna Soup' })).toBe(
      '"Tuna Soup" is already in time-based discount "Weekend sale", which is upcoming or running. A flash sale cannot share a product with it.',
    )
  })
})
