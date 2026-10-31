import { describe, it, expect, vi } from 'vitest'
import { loadLiveTierClaims, readMemberTitle } from '@/form/claimSteps'
import { buildClaims, listLiveTierClaims } from '@/form/claims'
import type { Config } from '@/lib/config'

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
      { kind: 'tier', discountId: 'disc_a', discountName: 'Spring', productId: 'p1', variantId: undefined },
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
