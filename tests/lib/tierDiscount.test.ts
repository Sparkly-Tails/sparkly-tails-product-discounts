import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildTierDiscountInput, ensureTierDiscount, ensureTierDiscountSafely,
  TIER_FUNCTION_HANDLE, TIER_DISCOUNT_TITLE, CLAIM_TIMEOUT_MS,
} from '@/lib/tierDiscount'
import { shopifyQuery } from '@/lib/shopify-client'

vi.mock('@/lib/shopify-client', () => ({ shopifyQuery: vi.fn() }))

const SHOP = 'demo.myshopify.com'
const NOW = new Date('2026-10-18T12:00:00.000Z')
const TIER_FUNCTION_ID = 'fn-tier'
const TIME_FUNCTION_ID = 'fn-time'

/** A small stateful stand-in for the parts of the Admin API this feature touches. */
interface FakeShopify {
  functions: { id: string; handle: string }[]
  discounts: { functionId: string | null; status: string }[]
  claim: { value: string; digest: number } | null
  created: { functionId: string; input: Record<string, unknown> }[]
  queries: string[]
  pageSize: number
  createErrors: { field: string[]; message: string }[]
  claimErrors: { field: string[]; message: string; code: string }[]
  /** Replaces the discounts the Nth discount lookup sees (0-based), to model another caller finishing in between. */
  lookupOverrides: Record<number, FakeShopify['discounts']>
  lookups: number
  nextDigest: number
}

function newFake(over: Partial<FakeShopify> = {}): FakeShopify {
  return {
    functions: [{ id: TIER_FUNCTION_ID, handle: TIER_FUNCTION_HANDLE }, { id: TIME_FUNCTION_ID, handle: 'time-based-discount' }],
    discounts: [], claim: null, created: [], queries: [], pageSize: 100, createErrors: [], claimErrors: [], lookupOverrides: {}, lookups: 0, nextDigest: 1,
    ...over,
  }
}

function install(fake: FakeShopify): void {
  vi.mocked(shopifyQuery).mockImplementation((async (query: string, variables?: Record<string, unknown>, shop?: string) => {
    expect(shop, `every call passes the shop: ${query.slice(0, 40)}`).toBe(SHOP)
    fake.queries.push(query)
    await Promise.resolve()
    if (query.includes('shopifyFunctions')) return { shopifyFunctions: { nodes: fake.functions } }
    if (query.includes('discountNodes')) {
      const seen = fake.lookupOverrides[fake.lookups] ?? fake.discounts
      fake.lookups += 1
      const from = Number(variables?.after ?? 0)
      const page = seen.slice(from, from + fake.pageSize)
      return {
        discountNodes: {
          nodes: page.map((d) => ({ discount: d.functionId ? { __typename: 'DiscountAutomaticApp', appDiscountType: { functionId: d.functionId } } : { __typename: 'DiscountCodeBasic' } })),
          pageInfo: { hasNextPage: from + fake.pageSize < seen.length, endCursor: String(from + fake.pageSize) },
        },
      }
    }
    if (query.includes('currentAppInstallation')) {
      return { currentAppInstallation: { id: 'gid://shopify/AppInstallation/1', metafield: fake.claim ? { value: fake.claim.value, compareDigest: String(fake.claim.digest) } : null } }
    }
    if (query.includes('metafieldsSet')) {
      if (fake.claimErrors.length) return { metafieldsSet: { metafields: [], userErrors: fake.claimErrors } }
      const input = (variables as { metafields: { value: string; compareDigest: string | null }[] }).metafields[0]
      const refused = input.compareDigest === null ? fake.claim !== null : !fake.claim || String(fake.claim.digest) !== input.compareDigest
      if (refused) return { metafieldsSet: { metafields: [], userErrors: [{ field: ['metafields', '0'], message: 'The resource has been modified', code: 'STALE_OBJECT' }] } }
      fake.claim = { value: input.value, digest: fake.nextDigest++ }
      return { metafieldsSet: { metafields: [{ value: input.value }], userErrors: [] } }
    }
    if (query.includes('metafieldsDelete')) {
      fake.claim = null
      return { metafieldsDelete: { deletedMetafields: [{ key: 'claim' }], userErrors: [] } }
    }
    if (query.includes('discountAutomaticAppCreate')) {
      const input = (variables as { automaticAppDiscount: Record<string, unknown> }).automaticAppDiscount
      if (fake.createErrors.length) return { discountAutomaticAppCreate: { automaticAppDiscount: null, userErrors: fake.createErrors } }
      const functionId = fake.functions.find((f) => f.handle === input.functionHandle)?.id ?? ''
      fake.created.push({ functionId, input })
      fake.discounts.push({ functionId, status: 'ACTIVE' })
      return { discountAutomaticAppCreate: { automaticAppDiscount: { discountId: `gid://shopify/DiscountAutomaticNode/${fake.created.length}` }, userErrors: [] } }
    }
    throw new Error(`unexpected query: ${query.slice(0, 60)}`)
  }) as never)
}

const ofKind = (fake: FakeShopify, word: string) => fake.queries.filter((q) => q.includes(word)).length

describe('buildTierDiscountInput', () => {
  it('returns exactly the tier discount input, with no combinesWith', () => {
    const input = buildTierDiscountInput('2026-10-18T12:00:00.000Z')
    expect(input).toEqual({
      title: 'Product tier discounts',
      functionHandle: 'product-discount',
      startsAt: '2026-10-18T12:00:00.000Z',
      discountClasses: ['PRODUCT'],
    })
    expect(input).not.toHaveProperty('combinesWith')
    expect(TIER_DISCOUNT_TITLE).toBe('Product tier discounts')
  })
})

describe('ensureTierDiscount', () => {
  beforeEach(() => {
    vi.mocked(shopifyQuery).mockReset()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates the discount when the store has none, then releases the claim', async () => {
    const fake = newFake({ discounts: [{ functionId: null, status: 'ACTIVE' }] })
    install(fake)

    expect(await ensureTierDiscount(SHOP)).toBe('created')

    expect(fake.created).toEqual([{ functionId: TIER_FUNCTION_ID, input: buildTierDiscountInput(NOW.toISOString()) }])
    expect(fake.claim).toBeNull()
  })

  it.each(['ACTIVE', 'SCHEDULED', 'EXPIRED'])('does nothing when a discount for the Function exists and is %s', async (status) => {
    const fake = newFake({ discounts: [{ functionId: TIER_FUNCTION_ID, status }] })
    install(fake)

    expect(await ensureTierDiscount(SHOP)).toBe('exists')

    expect(fake.created).toEqual([])
    expect(fake.queries.filter((q) => q.includes('Update') || q.includes('metafieldsSet') || q.includes('discountAutomaticAppCreate'))).toEqual([])
  })

  it('a store with a paused or customised discount is not touched', async () => {
    const fake = newFake({ discounts: [{ functionId: TIER_FUNCTION_ID, status: 'PAUSED' }] })
    install(fake)

    expect(await ensureTierDiscount(SHOP)).toBe('exists')
    expect(ofKind(fake, 'discountAutomaticApp')).toBe(0)
  })

  it('a discount of the time-based Function does not count', async () => {
    const fake = newFake({ discounts: [{ functionId: TIME_FUNCTION_ID, status: 'ACTIVE' }] })
    install(fake)

    expect(await ensureTierDiscount(SHOP)).toBe('created')
    expect(fake.created).toHaveLength(1)
  })

  it('finds the discount on a later page of the lookup', async () => {
    const fake = newFake({
      pageSize: 2,
      discounts: [{ functionId: null, status: 'ACTIVE' }, { functionId: null, status: 'ACTIVE' }, { functionId: null, status: 'ACTIVE' }, { functionId: TIER_FUNCTION_ID, status: 'SCHEDULED' }],
    })
    install(fake)

    expect(await ensureTierDiscount(SHOP)).toBe('exists')
    expect(fake.created).toEqual([])
  })

  it('two concurrent calls create exactly one discount', async () => {
    const fake = newFake()
    install(fake)

    const results = await Promise.all([ensureTierDiscount(SHOP), ensureTierDiscount(SHOP)])

    expect(fake.created).toHaveLength(1)
    expect([...results].sort()).toEqual(['created', 'exists'])
    expect(fake.claim).toBeNull()
  })

  it('five concurrent calls still create exactly one discount', async () => {
    const fake = newFake()
    install(fake)

    await Promise.all([1, 2, 3, 4, 5].map(() => ensureTierDiscount(SHOP)))

    expect(fake.created).toHaveLength(1)
  })

  it('looks again after winning the claim, so a caller that was slow does not create a second discount', async () => {
    // The first lookup (before the claim) sees nothing; by the second lookup another caller has finished.
    const fake = newFake({ lookupOverrides: { 0: [] }, discounts: [{ functionId: TIER_FUNCTION_ID, status: 'ACTIVE' }] })
    install(fake)

    expect(await ensureTierDiscount(SHOP)).toBe('exists')

    expect(fake.created).toEqual([])
    expect(fake.claim).toBeNull()
  })

  it('leaves a fresh claim held by someone else alone and creates nothing', async () => {
    const heldSince = new Date(NOW.getTime() - (CLAIM_TIMEOUT_MS - 5_000)).toISOString()
    const fake = newFake({ claim: { value: heldSince, digest: 7 } })
    install(fake)

    expect(await ensureTierDiscount(SHOP)).toBe('exists')

    expect(fake.created).toEqual([])
    expect(fake.claim).toEqual({ value: heldSince, digest: 7 })
  })

  it('a stale claim is taken over after the timeout', async () => {
    const heldSince = new Date(NOW.getTime() - (CLAIM_TIMEOUT_MS + 1_000)).toISOString()
    const fake = newFake({ claim: { value: heldSince, digest: 7 } })
    install(fake)

    expect(await ensureTierDiscount(SHOP)).toBe('created')

    expect(fake.created).toHaveLength(1)
    expect(fake.claim).toBeNull()
  })

  it('two callers taking over the same stale claim create exactly one discount', async () => {
    const heldSince = new Date(NOW.getTime() - (CLAIM_TIMEOUT_MS + 1_000)).toISOString()
    const fake = newFake({ claim: { value: heldSince, digest: 7 } })
    install(fake)

    await Promise.all([ensureTierDiscount(SHOP), ensureTierDiscount(SHOP)])

    expect(fake.created).toHaveLength(1)
  })

  it('treats a claim whose value is not a date as stale', async () => {
    const fake = newFake({ claim: { value: 'garbage', digest: 7 } })
    install(fake)

    expect(await ensureTierDiscount(SHOP)).toBe('created')
  })

  it('releases the claim and surfaces the error when creation fails', async () => {
    const fake = newFake({ createErrors: [{ field: ['automaticAppDiscount'], message: 'Function not found' }] })
    install(fake)

    await expect(ensureTierDiscount(SHOP)).rejects.toThrow('Function not found')

    expect(fake.claim).toBeNull()
    expect(fake.created).toEqual([])
  })

  it('throws a clear error when the tier Function is not deployed, and claims nothing', async () => {
    const fake = newFake({ functions: [{ id: TIME_FUNCTION_ID, handle: 'time-based-discount' }] })
    install(fake)

    await expect(ensureTierDiscount(SHOP)).rejects.toThrow(/product-discount.*not deployed/)

    expect(ofKind(fake, 'metafieldsSet')).toBe(0)
  })

  it('throws when the claim is refused for any reason other than losing the race', async () => {
    const fake = newFake({ claimErrors: [{ field: ['metafields'], message: 'Access denied', code: 'INVALID_VALUE' }] })
    install(fake)

    await expect(ensureTierDiscount(SHOP)).rejects.toThrow('Access denied')
    expect(fake.created).toEqual([])
  })
})

describe('ensureTierDiscountSafely', () => {
  beforeEach(() => {
    vi.mocked(shopifyQuery).mockReset()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the result when all goes well', async () => {
    install(newFake())

    expect(await ensureTierDiscountSafely(SHOP)).toBe('created')
  })

  it('returns failed and does not throw when creation errors, and logs the reason', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    install(newFake({ createErrors: [{ field: [], message: 'Function not found' }] }))

    expect(await ensureTierDiscountSafely(SHOP)).toBe('failed')

    expect(log.mock.calls.flat().join(' ')).toContain('Function not found')
    log.mockRestore()
  })
})
