import { describe, it, expect, vi } from 'vitest'
import { assertFreeOfClaims } from '@/form/claimChecks'
import { assertFreeOfLiveDiscounts, assertFreeOfOpenTimeDiscounts, loadLiveTierClaims, loadOpenTimeClaims, readMemberTitle } from '@/form/claimSteps'
import { buildClaims, CLAIM_TOOLS, describeSaveRefusal, findClaim, listLiveTierClaims, listOpenTimeClaims } from '@/form/claims'
import type { Config, Discount } from '@/lib/config'
import type { TimeDiscount } from '@/timeDiscounts/config'

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

const SPRING_LIVE: Discount = { discountId: 'disc_a', name: 'Spring', title: 'Spring', status: 'live', pricingMode: 'percent', members: [{ productId: 'p1' }], tiers: [] }
const WEEKEND: TimeDiscount = {
  discountId: 'time_a', shopifyDiscountId: 'gid://shopify/DiscountAutomaticNode/1', name: 'Old', title: 'Weekend sale', startsAt: '2026-11-01T09:00', endsAt: '2026-11-02T09:00',
  kind: 'perProduct', items: [{ productId: 'p2', pricingMode: 'percent', amount: 10 }],
}

function buildSaveTools(overrides: { tier?: Discount[]; time?: TimeDiscount[]; status?: 'Upcoming' | 'Active' | 'Expired' } = {}) {
  return {
    ...CLAIM_TOOLS,
    loadConfig: async () => ({ discounts: overrides.tier ?? [] }),
    loadTimeConfig: async () => ({ discounts: overrides.time ?? [] }),
    readTimeZone: async () => 'Europe/London',
    readStatus: vi.fn(() => overrides.status ?? 'Active'),
    listLiveTierClaims,
    listOpenTimeClaims,
    describeSaveRefusal,
    findClaim,
    readMemberInfo: async () => [{ productId: 'p1', title: 'x', productTitle: 'Tuna Soup', price: 1, handle: 'tuna', imageUrl: null }],
    readMemberTitle,
    assertFreeOfClaims,
    loadLiveTierClaims,
    loadOpenTimeClaims,
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

describe('assertFreeOfOpenTimeDiscounts', () => {
  const members = [{ productId: 'p2' }]

  it('throws when a member is in a time-based discount that is upcoming or running', async () => {
    for (const status of ['Upcoming', 'Active'] as const) {
      await expect(assertFreeOfOpenTimeDiscounts({ members, discountId: 'disc_b', tools: buildSaveTools({ time: [WEEKEND], status }) })).rejects.toThrow(
        'is already in time-based discount "Weekend sale", which is upcoming or running. A flash sale cannot share a product with it.',
      )
    }
  })

  it('passes when the time-based discount has expired, reading its status in the shop time zone', async () => {
    const tools = buildSaveTools({ time: [WEEKEND], status: 'Expired' })
    await expect(assertFreeOfOpenTimeDiscounts({ members, discountId: 'disc_b', tools })).resolves.toBeUndefined()
    expect(tools.readStatus).toHaveBeenCalledWith('2026-11-01T09:00', '2026-11-02T09:00', 'Europe/London')
  })
})
