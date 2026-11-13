import { describe, it, expect, vi } from 'vitest'
import { buildCombinesWith, hasFlashSale, listFailureMessages, pickStackingFlags, pickTierRecordIds, readSharedStacking, writeStacking } from '@/settings/stacking'
import type { ShopifyQuery } from '@/flash/shopifyRecord'

const TIER_FUNCTION = { id: 'fn-tier', handle: 'product-discount' }

function node(options: { id: string; functionId: string; isFlash?: boolean; order?: boolean; shipping?: boolean; product?: boolean }) {
  return {
    id: options.id,
    flash: options.isFlash ? { id: 'meta' } : null,
    discount: {
      combinesWith: { orderDiscounts: options.order ?? false, shippingDiscounts: options.shipping ?? false, productDiscounts: options.product ?? false },
      appDiscountType: { functionId: options.functionId },
    },
  }
}

function fakeQuery(nodes: ReturnType<typeof node>[], refusals: Record<string, string> = {}) {
  return vi.fn(async (text: string, variables?: { id?: string }) => {
    if (!text.includes('discountAutomaticAppUpdate')) return { shopifyFunctions: { nodes: [TIER_FUNCTION] }, discountNodes: { nodes } }
    const message = refusals[variables?.id ?? '']
    return { discountAutomaticAppUpdate: { userErrors: message ? [{ message }] : [] } }
  })
}

const asQuery = (query: ReturnType<typeof fakeQuery>) => query as unknown as ShopifyQuery
const updates = (query: ReturnType<typeof fakeQuery>) => query.mock.calls.filter(([text]) => text.includes('discountAutomaticAppUpdate')).map(([, variables]) => variables)

describe('buildCombinesWith', () => {
  it('passes the three choices through when there is no flash sale', () => {
    expect(buildCombinesWith({ orderDiscounts: true, shippingDiscounts: false, productDiscounts: false, hasFlash: false })).toEqual({ orderDiscounts: true, shippingDiscounts: false, productDiscounts: false })
  })

  it('keeps product discounts on while a flash sale exists, whatever the choice was', () => {
    expect(buildCombinesWith({ orderDiscounts: false, shippingDiscounts: false, productDiscounts: false, hasFlash: true }).productDiscounts).toBe(true)
  })
})

describe('readSharedStacking', () => {
  it('reads the three choices of the shared tier record', async () => {
    const query = fakeQuery([node({ id: 'shared', functionId: 'fn-tier', order: true, product: true })])
    expect(await readSharedStacking({ query: asQuery(query) })).toEqual({ orderDiscounts: true, shippingDiscounts: false, productDiscounts: true })
  })

  it('ignores a flash record and reads all off when the store has no shared record', async () => {
    const query = fakeQuery([node({ id: 'flash', functionId: 'fn-tier', isFlash: true, order: true })])
    expect(await readSharedStacking({ query: asQuery(query) })).toEqual({ orderDiscounts: false, shippingDiscounts: false, productDiscounts: false })
  })
})

describe('pickTierRecordIds and pickStackingFlags', () => {
  const flags = { orderDiscounts: false, shippingDiscounts: false, productDiscounts: false }

  it('picks the shared and flash records of the tier Function and nothing else', () => {
    const nodes = [
      { id: 'a', functionId: 'fn-tier', sharedKey: 'fn-tier', state: 'false' as const, ...flags },
      { id: 'b', functionId: 'fn-tier', sharedKey: '', state: 'false' as const, ...flags },
      { id: 'c', functionId: 'fn-other', sharedKey: 'fn-other', state: 'false' as const, ...flags },
    ]
    expect(pickTierRecordIds({ nodes, functionId: 'fn-tier' })).toEqual(['a', 'b'])
  })

  it('picks no record when the tier Function is not found, even for discounts without a Function', () => {
    const nodes = [{ id: 'code', functionId: '', sharedKey: '', state: 'false' as const, ...flags }]
    expect(pickTierRecordIds({ nodes, functionId: '' })).toEqual([])
  })

  it('reads the three choices of a record', () => {
    expect(pickStackingFlags({ record: { id: 'a', functionId: 'f', sharedKey: 'f', state: 'true', orderDiscounts: true, shippingDiscounts: false, productDiscounts: true } })).toEqual({ orderDiscounts: true, shippingDiscounts: false, productDiscounts: true })
  })
})

describe('listFailureMessages', () => {
  it('lists the messages of the rejected updates and skips the ones that worked', () => {
    const results: PromiseSettledResult<void>[] = [{ status: 'fulfilled', value: undefined }, { status: 'rejected', reason: new Error('No.') }, { status: 'rejected', reason: 'odd' }]
    expect(listFailureMessages({ results })).toEqual(['No.', 'Shopify refused the update'])
  })
})

describe('writeStacking', () => {
  const flags = { orderDiscounts: true, shippingDiscounts: true, productDiscounts: false }

  it('updates the shared record and every flash record with the three choices', async () => {
    const query = fakeQuery([
      node({ id: 'shared', functionId: 'fn-tier' }),
      node({ id: 'flash-1', functionId: 'fn-tier', isFlash: true }),
      node({ id: 'other', functionId: 'fn-other' }),
    ])
    await writeStacking({ flags, hasFlash: false, query: asQuery(query) })
    const combinesWith = { orderDiscounts: true, shippingDiscounts: true, productDiscounts: false }
    expect(updates(query)).toEqual([{ id: 'shared', combinesWith }, { id: 'flash-1', combinesWith }])
  })

  it('writes product discounts on when a flash sale exists', async () => {
    const query = fakeQuery([node({ id: 'shared', functionId: 'fn-tier' })])
    await writeStacking({ flags, hasFlash: true, query: asQuery(query) })
    expect(updates(query)[0]).toMatchObject({ combinesWith: { productDiscounts: true } })
  })

  it('tries every record and throws every refusal together', async () => {
    const query = fakeQuery(
      [node({ id: 'shared', functionId: 'fn-tier' }), node({ id: 'flash-1', functionId: 'fn-tier', isFlash: true }), node({ id: 'flash-2', functionId: 'fn-tier', isFlash: true })],
      { shared: 'Shared refused.', 'flash-2': 'Flash refused.' },
    )
    await expect(writeStacking({ flags, hasFlash: true, query: asQuery(query) })).rejects.toThrow('Shared refused.; Flash refused.')
    expect(updates(query)).toHaveLength(3)
  })

  it('changes nothing when the store has no tier records', async () => {
    const query = fakeQuery([])
    await writeStacking({ flags, hasFlash: false, query: asQuery(query) })
    expect(updates(query)).toEqual([])
  })
})

describe('hasFlashSale', () => {
  it('is true when any discount has a flash sale and false otherwise', () => {
    expect(hasFlashSale({ discounts: [{}, { flash: { startsAt: 'a', endsAt: 'b' } }] })).toBe(true)
    expect(hasFlashSale({ discounts: [{}, { flash: undefined }] })).toBe(false)
    expect(hasFlashSale({ discounts: [] })).toBe(false)
  })
})
