// Turns the facts of one order into the rows that are stored: one per discount that has a bundle line in the order.
import { measureAddedRevenue, roundMoney } from '@/metrics/addedRevenue'
import type { BundleOrderRow, OrderFacts, OrderLineFacts } from '@/metrics/types'

/** The live discount a line counts for: it must have got this app's discount and be a product of a live discount. */
export function pickLineDiscount({ line, productDiscounts }: { line: OrderLineFacts; productDiscounts: Record<string, string> }): string | null {
  return line.appDiscounted && Object.hasOwn(productDiscounts, line.productId) ? productDiscounts[line.productId] : null
}

export function buildEmptyRow({ discountId, order }: { discountId: string; order: OrderFacts }): BundleOrderRow {
  return { discountId, orderId: order.orderId, orderedAt: order.orderedAt, currency: order.currency, units: 0, orderSubtotal: order.subtotal, discountAmount: 0, addedRevenue: 0 }
}

/** Adds one line to the discount's row, starting the row when this is its first line. */
export function addLineToRow({ row, discountId, order, line, tools }: { row: BundleOrderRow | undefined; discountId: string; order: OrderFacts; line: OrderLineFacts; tools: ListRowsTools }): BundleOrderRow {
  const base = row ?? tools.buildEmptyRow({ discountId, order })
  return {
    ...base,
    units: base.units + line.quantity,
    discountAmount: tools.roundMoney({ amount: base.discountAmount + line.discountAmount }),
    addedRevenue: tools.roundMoney({ amount: base.addedRevenue + tools.measureAddedRevenue(line) }),
  }
}

export const LIST_ROWS_TOOLS = { pickLineDiscount, buildEmptyRow, addLineToRow, roundMoney, measureAddedRevenue }

export type ListRowsTools = typeof LIST_ROWS_TOOLS

/** `productDiscounts` maps a product id to the id of the live discount it belongs to. The order's subtotal is the whole order's on every row. */
export function listBundleRows({ order, productDiscounts, tools }: { order: OrderFacts; productDiscounts: Record<string, string>; tools: ListRowsTools }): BundleOrderRow[] {
  const rows: Record<string, BundleOrderRow> = {}
  for (const line of order.lines) {
    const discountId = tools.pickLineDiscount({ line, productDiscounts })
    if (discountId) rows[discountId] = tools.addLineToRow({ row: rows[discountId], discountId, order, line, tools })
  }
  return Object.values(rows)
}
