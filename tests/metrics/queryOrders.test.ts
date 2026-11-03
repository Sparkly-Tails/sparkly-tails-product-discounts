import { describe, it, expect, vi } from 'vitest'
import { queryOrders, ORDERS_QUERY } from '@/metrics/queryOrders'

const SHOP = 'demo.myshopify.com'

describe('queryOrders', () => {
  it('asks for the paid orders created since the time, 50 at a time, oldest first, from the cursor', async () => {
    const queryShop = vi.fn(async () => ({ orders: { nodes: [{ id: 'a' }], pageInfo: { hasNextPage: true, endCursor: 'c1' } } }))
    const result = await queryOrders({ shop: SHOP, sinceIso: '2026-08-04T12:00:00.000Z', afterCursor: 'c0', queryShop })
    expect(queryShop).toHaveBeenCalledWith({ query: ORDERS_QUERY, shop: SHOP, variables: { query: "financial_status:paid created_at:>='2026-08-04T12:00:00.000Z'", after: 'c0' } })
    expect(result).toEqual({ nodes: [{ id: 'a' }], endCursor: 'c1', hasNextPage: true })
  })

  it('asks for no customer field, and for the discount title of each allocation', () => {
    expect(ORDERS_QUERY).not.toMatch(/customer|email|phone|address|shippingAddress|billingAddress/i)
    expect(ORDERS_QUERY).toContain('discountApplication')
    expect(ORDERS_QUERY).toContain('... on AutomaticDiscountApplication { title }')
  })

  it('gives an empty last page for an answer that is not the shape expected', async () => {
    expect(await queryOrders({ shop: SHOP, sinceIso: 'x', afterCursor: null, queryShop: vi.fn(async () => ({})) })).toEqual({ nodes: [], endCursor: null, hasNextPage: false })
  })
})
