// The four numbers of the homepage cards, from the stored rows of a period and the visitors of the same period.
import type { BundleOrderRow } from '@/metrics/types'

export interface MetricTotals {
  visitors: number
  orders: number
  averageOrderValue: number
  addedRevenue: number
}

function pickSubtotalEntry(row: BundleOrderRow): [string, number] {
  return [row.orderId, row.orderSubtotal]
}

function readAddedRevenue(row: BundleOrderRow): number {
  return row.addedRevenue
}

function addNumbers(total: number, amount: number): number {
  return total + amount
}

/** An order that is in the rows of two discounts counts once as an order and once in the average; its added revenue is the sum of both rows. */
export function sumTotals({ rows, visitors }: { rows: BundleOrderRow[]; visitors: number }): MetricTotals {
  const subtotals = [...new Map(rows.map(pickSubtotalEntry)).values()]
  const orders = subtotals.length
  return {
    visitors,
    orders,
    averageOrderValue: orders ? Math.round((subtotals.reduce(addNumbers, 0) / orders) * 100) / 100 : 0,
    addedRevenue: Math.round(rows.map(readAddedRevenue).reduce(addNumbers, 0) * 100) / 100,
  }
}
