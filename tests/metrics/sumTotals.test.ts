import { describe, it, expect } from 'vitest'
import { sumTotals } from '@/metrics/sumTotals'
import type { BundleOrderRow } from '@/metrics/types'

const row = (over: Partial<BundleOrderRow> = {}): BundleOrderRow => ({ discountId: 'd1', orderId: 'o1', orderedAt: '2026-11-02T10:00:00.000Z', currency: 'GBP', units: 10, orderSubtotal: 20, discountAmount: 2, addedRevenue: 10, ...over })

describe('sumTotals', () => {
  it('counts an order that is in two discounts as one order, takes its subtotal once, and adds both rows\' added revenue', () => {
    expect(sumTotals({ rows: [row({ discountId: 'd1', addedRevenue: 10 }), row({ discountId: 'd2', addedRevenue: 4 })], visitors: 30 })).toEqual({ visitors: 30, orders: 1, averageOrderValue: 20, addedRevenue: 14 })
  })

  it('averages the subtotals of the distinct orders and rounds to cents', () => {
    expect(sumTotals({ rows: [row({ orderId: 'o1', orderSubtotal: 10 }), row({ orderId: 'o2', orderSubtotal: 10 }), row({ orderId: 'o3', orderSubtotal: 10.01 })], visitors: 0 }).averageOrderValue).toBe(10)
  })

  it('gives zeros when there are no rows', () => {
    expect(sumTotals({ rows: [], visitors: 0 })).toEqual({ visitors: 0, orders: 0, averageOrderValue: 0, addedRevenue: 0 })
  })

  it('counts the rows of a discount that no longer exists like any other', () => {
    expect(sumTotals({ rows: [row({ discountId: 'deleted-discount' })], visitors: 5 }).orders).toBe(1)
  })
})
