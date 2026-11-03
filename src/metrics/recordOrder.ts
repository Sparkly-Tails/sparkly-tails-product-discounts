// Records a paid order for the metrics: reads it, finds the bundle lines, and saves one row per discount. Every outside
// step is handed in, so the rules can be tried without a database. Saving the same order again changes nothing.
import type { BundleOrderRow, OrderFacts } from '@/metrics/types'

export interface RecordOrderTools {
  readOrder: (args: { body: string }) => OrderFacts | null
  readLiveProducts: (args: { shop: string }) => Promise<Record<string, string>>
  listRows: (args: { order: OrderFacts; productDiscounts: Record<string, string> }) => BundleOrderRow[]
  saveRows: (args: { shop: string; rows: BundleOrderRow[] }) => Promise<void>
}

/** The number of rows saved: 0 for an order with no bundle line or a body that cannot be read. */
export async function recordOrder({ body, shop, tools }: { body: string; shop: string; tools: RecordOrderTools }): Promise<number> {
  const order = tools.readOrder({ body })
  if (!order) return 0
  const rows = tools.listRows({ order, productDiscounts: await tools.readLiveProducts({ shop }) })
  if (rows.length === 0) return 0
  await tools.saveRows({ shop, rows })
  return rows.length
}
