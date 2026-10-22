// Reads the shop's discounts and turns them into the rows of the homepage
// table. Everything it calls is handed in, so the page decides where the data
// comes from.
import type { DiscountRow, TimeStatusLabel } from '@/home/discountRows'
import type { GetFlashStatus } from '@/home/buildRows'
import type { RowTools } from '@/home/rowTools'

export interface TierDiscountInput {
  discountId: string
  name: string
  title: string
  status: 'draft' | 'live'
  pricingMode: 'percent' | 'fixed'
  tiers: { minQty: number; percentOff?: number; fixedPrice?: number }[]
  /** Present when the discount runs as a flash sale (the shop's local times). */
  flash?: { startsAt: string; endsAt: string }
}

export interface TimeDiscountInput {
  discountId: string
  title: string
  startsAt: string
  endsAt: string
}

export async function loadDiscountRows(options: {
  loadTierDiscounts: () => Promise<TierDiscountInput[]>
  loadTimeDiscounts: () => Promise<TimeDiscountInput[]>
  loadTimezone: () => Promise<string>
  loadCurrencyCode: () => Promise<string>
  getStatusLabel: (options: { startsAt: string; endsAt: string; timezone: string }) => TimeStatusLabel
  getFlashStatus: GetFlashStatus
  tools: RowTools
}): Promise<DiscountRow[]> {
  const { loadTierDiscounts, loadTimeDiscounts, loadTimezone, loadCurrencyCode, getStatusLabel, getFlashStatus, tools } = options
  const [tierDiscounts, timeDiscounts, timezone, currencyCode] = await Promise.all([
    loadTierDiscounts(),
    loadTimeDiscounts(),
    loadTimezone(),
    loadCurrencyCode(),
  ])

  const tierRows = tools.buildTierRows({ discounts: tierDiscounts, currencyCode, timezone, getFlashStatus, tools })
  const timeRows = tools.buildTimeRows({ discounts: timeDiscounts, timezone, getStatusLabel, tools })
  return tools.buildDiscountRows({ tierRows, timeRows })
}
