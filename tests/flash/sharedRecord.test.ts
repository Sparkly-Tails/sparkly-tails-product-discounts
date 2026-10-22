import { describe, it, expect, vi } from 'vitest'
import { allowSharedCombining, SHARED_RECORD_TOOLS, findSharedRecord, flattenRecordNode, findFunctionId } from '@/flash/sharedRecord'
import type { ShopifyQuery } from '@/flash/shopifyRecord'

const TIER_FUNCTION = { id: 'fn-tier', handle: 'product-discount' }
const TIME_FUNCTION = { id: 'fn-time', handle: 'time-based-discount' }

function node(options: { id: string; functionId: string; isFlash?: boolean; combines?: boolean }) {
  return {
    id: options.id,
    flash: options.isFlash ? { id: 'meta' } : null,
    discount: { __typename: 'DiscountAutomaticApp', combinesWith: { productDiscounts: options.combines ?? false }, appDiscountType: { functionId: options.functionId } },
  }
}

function fakeQuery(nodes: ReturnType<typeof node>[], updateErrors: { message: string }[] = []) {
  return vi.fn(async (text: string) =>
    text.includes('discountAutomaticAppUpdate')
      ? { discountAutomaticAppUpdate: { userErrors: updateErrors } }
      : { shopifyFunctions: { nodes: [TIER_FUNCTION, TIME_FUNCTION] }, discountNodes: { nodes } },
  )
}

const run = (query: ReturnType<typeof fakeQuery>) => allowSharedCombining({ query: query as unknown as ShopifyQuery, tools: SHARED_RECORD_TOOLS })

describe('allowSharedCombining', () => {
  it('turns on product-discount combining on the shared tier record and says it updated', async () => {
    const query = fakeQuery([node({ id: 'gid://shopify/DiscountAutomaticNode/1', functionId: 'fn-tier' })])
    expect(await run(query)).toBe('updated')
    const [text, variables] = query.mock.calls[1] as unknown as [string, { id: string }]
    expect(text).toContain('productDiscounts: true')
    expect(variables).toEqual({ id: 'gid://shopify/DiscountAutomaticNode/1' })
  })

  it('does nothing when the shared record already combines', async () => {
    const query = fakeQuery([node({ id: 'gid://shopify/DiscountAutomaticNode/1', functionId: 'fn-tier', combines: true })])
    expect(await run(query)).toBe('already')
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('never touches a flash record or another Function\'s discount', async () => {
    const query = fakeQuery([
      node({ id: 'gid://shopify/DiscountAutomaticNode/2', functionId: 'fn-tier', isFlash: true }),
      node({ id: 'gid://shopify/DiscountAutomaticNode/3', functionId: 'fn-time' }),
    ])
    expect(await run(query)).toBe('missing')
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('says missing when the store has no records at all', async () => {
    expect(await run(fakeQuery([]))).toBe('missing')
  })

  it('throws the text Shopify gives when it refuses the update', async () => {
    const query = fakeQuery([node({ id: 'gid://shopify/DiscountAutomaticNode/1', functionId: 'fn-tier' })], [{ message: 'Not allowed.' }])
    await expect(run(query)).rejects.toThrow('Not allowed.')
  })
})

describe('flattenRecordNode, findSharedRecord and findFunctionId', () => {
  it('flattens a Shopify node to plain values, leaving the shared key empty for a flash record', () => {
    expect(flattenRecordNode({ node: node({ id: 'a', functionId: 'fn-tier', combines: true }), tools: SHARED_RECORD_TOOLS })).toEqual({ id: 'a', sharedKey: 'fn-tier', state: 'true' })
    expect(flattenRecordNode({ node: node({ id: 'b', functionId: 'fn-tier', isFlash: true }), tools: SHARED_RECORD_TOOLS })).toEqual({ id: 'b', sharedKey: '', state: 'false' })
  })

  it('treats a node without Function details (a code discount of an app) as no Function and not combining', () => {
    const bare = { id: 'c', flash: null, discount: {} }
    expect(flattenRecordNode({ node: bare, tools: SHARED_RECORD_TOOLS })).toEqual({ id: 'c', sharedKey: '', state: 'false' })
  })

  it('picks the first shared record of the Function, or reports a missing one', () => {
    const nodes = [
      { id: 'a', sharedKey: '', state: 'false' as const },
      { id: 'b', sharedKey: 'fn-tier', state: 'false' as const },
    ]
    expect(findSharedRecord({ nodes, functionId: 'fn-tier' }).id).toBe('b')
    expect(findSharedRecord({ nodes, functionId: 'other' }).state).toBe('missing')
  })

  it('finds the Function id by handle, or an empty text', () => {
    expect(findFunctionId({ functions: [TIER_FUNCTION, TIME_FUNCTION], handle: 'time-based-discount' })).toBe('fn-time')
    expect(findFunctionId({ functions: [TIER_FUNCTION], handle: 'nope' })).toBe('')
  })
})
