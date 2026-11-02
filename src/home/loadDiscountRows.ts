// Reads the shop's discounts and turns them into the rows of the homepage
// table. Everything it calls is handed in, so the page decides where the data
// comes from.
import type { DiscountRow } from '@/home/discountRows'
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

export async function loadDiscountRows(options: {
  loadTierDiscounts: () => Promise<TierDiscountInput[]>
  loadTimezone: () => Promise<string>
  loadCurrencyCode: () => Promise<string>
  getFlashStatus: GetFlashStatus
  tools: RowTools
}): Promise<DiscountRow[]> {
  const { loadTierDiscounts, loadTimezone, loadCurrencyCode, getFlashStatus, tools } = options
  const [tierDiscounts, timezone, currencyCode] = await Promise.all([
    loadTierDiscounts(),
    loadTimezone(),
    loadCurrencyCode(),
  ])

  return tools.buildTierRows({ discounts: tierDiscounts, currencyCode, timezone, getFlashStatus, tools })
}
