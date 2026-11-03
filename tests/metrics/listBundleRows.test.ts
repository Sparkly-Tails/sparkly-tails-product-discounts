import { describe, it, expect } from 'vitest'
import { listBundleRows, LIST_ROWS_TOOLS } from '@/metrics/listBundleRows'
import type { OrderFacts, OrderLineFacts } from '@/metrics/types'

const line = (over: Partial<OrderLineFacts> = {}): OrderLineFacts => ({ productId: 'gid://shopify/Product/1', quantity: 10, unitPrice: 2, discountAmount: 3, appDiscounted: true, ...over })
const order = (lines: OrderLineFacts[]): OrderFacts => ({ orderId: 'gid://shopify/Order/1', orderedAt: '2026-11-02T10:00:00Z', currency: 'GBP', subtotal: 40, lines })
const MAP = { 'gid://shopify/Product/1': 'd1', 'gid://shopify/Product/2': 'd1', 'gid://shopify/Product/3': 'd2' }
const rows = (facts: OrderFacts, map: Record<string, string> = MAP) => listBundleRows({ order: facts, productDiscounts: map, tools: LIST_ROWS_TOOLS })

describe('listBundleRows', () => {
  it('gives one row for a discount with several lines, summing units, discount and added revenue of those lines', () => {
    expect(rows(order([line(), line({ productId: 'gid://shopify/Product/2', quantity: 5, unitPrice: 1, discountAmount: 1 })]))).toEqual([
      { discountId: 'd1', orderId: 'gid://shopify/Order/1', orderedAt: '2026-11-02T10:00:00Z', currency: 'GBP', units: 15, orderSubtotal: 40, discountAmount: 4, addedRevenue: 15 + 3 },
    ])
  })

  it('gives a row for each discount in the order, each with the whole order\'s subtotal', () => {
    const result = rows(order([line(), line({ productId: 'gid://shopify/Product/3', quantity: 4, unitPrice: 5, discountAmount: 2 })]))
    expect(result.map((row) => row.discountId).sort()).toEqual(['d1', 'd2'])
    expect(result.every((row) => row.orderSubtotal === 40)).toBe(true)
  })

  it('ignores a line that did not get this app\'s discount', () => {
    expect(rows(order([line({ appDiscounted: false })]))).toEqual([])
  })

  it('ignores a product that is in no live discount, and a line without a product', () => {
    expect(rows(order([line({ productId: 'gid://shopify/Product/99' }), line({ productId: '' })]))).toEqual([])
  })

  it('gives no rows for an order with no bundle line', () => {
    expect(rows(order([]))).toEqual([])
  })

  it('does not take names of the map\'s prototype for products', () => {
    expect(rows(order([line({ productId: 'constructor' })]))).toEqual([])
  })
})
