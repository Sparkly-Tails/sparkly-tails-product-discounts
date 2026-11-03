import type { MetricTotals } from '@/metrics/sumTotals'

export interface MetricCard {
  label: string
  value: string
  hint: string
}

type FormatMoney = (args: { amount: number; currencyCode: string }) => string

const NEEDS_PERMISSION = 'Needs permission'

/** The four cards of the homepage in their order; without the permission every value asks for it. */
export function buildMetricCards({ totals, currencyCode, hasPermission, formatMoney }: { totals: MetricTotals; currencyCode: string; hasPermission: boolean; formatMoney: FormatMoney }): MetricCard[] {
  const values = hasPermission
    ? [String(totals.visitors), String(totals.orders), formatMoney({ amount: totals.averageOrderValue, currencyCode }), formatMoney({ amount: totals.addedRevenue, currencyCode })]
    : Array<string>(4).fill(NEEDS_PERMISSION)
  return [
    { label: 'Visitors', value: values[0], hint: 'Estimate of the visitors who viewed a product with a discount in the period' },
    { label: 'Bundle orders', value: values[1], hint: 'Paid orders with at least one discounted bundle line' },
    { label: 'AOV', value: values[2], hint: 'Average order value of bundle orders, after discounts, before tax and shipping' },
    { label: 'Added revenue', value: values[3], hint: 'Extra money from bundle lines beyond one unit at the regular price' },
  ]
}

/** The cards when the numbers could not be loaded. */
export function buildFailedCards(): MetricCard[] {
  return ['Visitors', 'Bundle orders', 'AOV', 'Added revenue'].map((label) => ({ label, value: '-', hint: 'Could not load' }))
}
