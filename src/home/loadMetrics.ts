import type { MetricTotals } from '@/metrics/sumTotals'
import type { BundleOrderRow } from '@/metrics/types'

interface LoadMetricsArgs {
  shop: string
  nowIso: string
  fromDay: string
  toDay: string
  timeZone: string
  readScopes: (args: { shop: string }) => Promise<string[]>
  syncOrders: (args: { shop: string; nowIso: string }) => Promise<'synced' | 'up-to-date' | 'needs-permission'>
  refresh: (args: { shop: string; timeZone: string }) => Promise<void>
  readRows: (args: { shop: string; fromIso: string; toIso: string }) => Promise<BundleOrderRow[]>
  readVisitors: (args: { shop: string; fromDay: string; toDay: string }) => Promise<number>
  sumTotals: (args: { rows: BundleOrderRow[]; visitors: number }) => MetricTotals
  convertToUtc: (naive: string, timeZone: string) => string
  addDays: (args: { day: string; count: number }) => string
}

const NO_TOTALS: MetricTotals = { visitors: 0, orders: 0, averageOrderValue: 0, addedRevenue: 0 }

/** Refreshes the settings the sync and the visit counting read, reads the scopes, brings the orders up to date, then reads the stored numbers of the period (days in the shop's time zone). */
export async function loadMetrics(args: LoadMetricsArgs): Promise<{ totals: MetricTotals; hasPermission: boolean }> {
  const { shop, nowIso, fromDay, toDay, timeZone } = args
  await args.refresh({ shop, timeZone })
  const scopes = await args.readScopes({ shop })
  if (!scopes.includes('read_orders')) return { totals: NO_TOTALS, hasPermission: false }
  const synced = await args.syncOrders({ shop, nowIso })
  if (synced === 'needs-permission') return { totals: NO_TOTALS, hasPermission: false }
  const fromIso = args.convertToUtc(`${fromDay}T00:00`, timeZone)
  const toIso = args.convertToUtc(`${args.addDays({ day: toDay, count: 1 })}T00:00`, timeZone)
  const rows = await args.readRows({ shop, fromIso, toIso })
  const visitors = await args.readVisitors({ shop, fromDay, toDay })
  return { totals: args.sumTotals({ rows, visitors }), hasPermission: true }
}
