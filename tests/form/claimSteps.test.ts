import { describe, it, expect, vi } from 'vitest'
import { assertFreeOfClaims } from '@/form/claimChecks'
import { assertFreeOfLiveDiscounts, loadLiveTierClaims, readMemberTitle } from '@/form/claimSteps'
import { buildClaims, CLAIM_TOOLS, describeSaveRefusal, findClaim, listLiveTierClaims } from '@/form/claims'
import type { Config, Discount } from '@/lib/config'

describe('loadLiveTierClaims', () => {
  it('reads the stored discounts and claims the members of the live ones only', async () => {
    const config: Config = {
      discounts: [
        { discountId: 'disc_a', name: 'Spring', title: 'Spring', status: 'live', pricingMode: 'percent', members: [{ productId: 'p1' }], tiers: [] },
        { discountId: 'disc_b', name: 'Autumn', title: 'Autumn', status: 'draft', pricingMode: 'percent', members: [{ productId: 'p2' }], tiers: [] },
      ],
    }
    const loadConfig = vi.fn(async () => config)
    expect(await loadLiveTierClaims({ tools: { loadConfig, listLiveTierClaims, buildClaims } })).toEqual([
      { discountId: 'disc_a', discountName: 'Spring', productId: 'p1', variantId: undefined },
    ])
    expect(loadConfig).toHaveBeenCalledTimes(1)
  })
})

describe('readMemberTitle', () => {
  const info = { productId: 'p1', title: 'x', productTitle: 'Tuna Soup', price: 1, handle: 'tuna', imageUrl: null }

  it('is the product title, with the variant in brackets for a variant', async () => {
    expect(await readMemberTitle({ member: { productId: 'p1' }, tools: { readMemberInfo: async () => [info] } })).toBe('Tuna Soup')
    expect(await readMemberTitle({ member: { productId: 'p1', variantId: 'v1' }, tools: { readMemberInfo: async () => [{ ...info, variantId: 'v1', variantTitle: '90 Chews' }] } })).toBe('Tuna Soup (90 Chews)')
  })

  it('falls back to the product id when the shop no longer has the product', async () => {
    expect(await readMemberTitle({ member: { productId: 'p1' }, tools: { readMemberInfo: async () => [] } })).toBe('p1')
  })
})

const SPRING_LIVE: Discount = { discountId: 'disc_a', name: 'Spring', title: 'Spring', status: 'live', pricingMode: 'percent', members: [{ productId: 'p1' }], tiers: [] }

function buildSaveTools(overrides: { tier?: Discount[] } = {}) {
  return {
    ...CLAIM_TOOLS,
    loadConfig: async () => ({ discounts: overrides.tier ?? [] }),
    listLiveTierClaims,
    describeSaveRefusal,
    findClaim,
    readMemberInfo: async () => [{ productId: 'p1', title: 'x', productTitle: 'Tuna Soup', price: 1, handle: 'tuna', imageUrl: null }],
    readMemberTitle,
    assertFreeOfClaims,
    loadLiveTierClaims,
  }
}

describe('assertFreeOfLiveDiscounts', () => {
  it('throws, naming the product and the live discount, when a member is in another live discount', async () => {
    await expect(assertFreeOfLiveDiscounts({ members: [{ productId: 'p1' }], discountId: 'disc_b', tools: buildSaveTools({ tier: [SPRING_LIVE] }) })).rejects.toThrow(
      '"Tuna Soup" is already in live discount "Spring". A product can only be in one live discount: take "Spring" offline or remove the product here.',
    )
  })

  it('passes for a product only a draft has, and for the discount being saved', async () => {
    const draft = { ...SPRING_LIVE, status: 'draft' as const }
    await expect(assertFreeOfLiveDiscounts({ members: [{ productId: 'p1' }], discountId: 'disc_b', tools: buildSaveTools({ tier: [draft] }) })).resolves.toBeUndefined()
    await expect(assertFreeOfLiveDiscounts({ members: [{ productId: 'p1' }], discountId: 'disc_a', tools: buildSaveTools({ tier: [SPRING_LIVE] }) })).resolves.toBeUndefined()
  })
})
