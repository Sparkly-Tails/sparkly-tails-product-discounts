// Reads the shop's discounts and turns them into the rows of the homepage
// table. Everything it calls is handed in, so the page decides where the data
// comes from.
import type { DiscountRow, TimeStatusLabel } from '@/home/discountRows'
import type { ROW_TOOLS } from '@/home/rowTools'

export interface TierDiscountInput {
  discountId: string
  name: string
  title: string
  status: 'draft' | 'live'
  pricingMode: 'percent' | 'fixed'
  tiers: { minQty: number; percentOff?: number; fixedPrice?: number }[]
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
  tools: typeof ROW_TOOLS
}): Promise<DiscountRow[]> {
  const { loadTierDiscounts, loadTimeDiscounts, loadTimezone, loadCurrencyCode, getStatusLabel, tools } = options
  const [tierDiscounts, timeDiscounts, timezone, currencyCode] = await Promise.all([
    loadTierDiscounts(),
    loadTimeDiscounts(),
    loadTimezone(),
    loadCurrencyCode(),
  ])

  const tierRows: DiscountRow[] = []
  for (const discount of tierDiscounts) {
    const steps = tools.listTierSteps({ tiers: discount.tiers, pricingMode: discount.pricingMode })
    const rules = tools.describeTierRules({ steps, pricingMode: discount.pricingMode, currencyCode, formatMoney: tools.formatMoneyAmount })
    tierRows.push(
      tools.buildTierRow({
        discountId: discount.discountId,
        name: discount.name,
        title: discount.title,
        status: discount.status,
        rules,
        pickTitle: tools.pickRowTitle,
        pickSubtitle: tools.pickRowSubtitle,
      }),
    )
  }

  const timeRows: DiscountRow[] = []
  for (const discount of timeDiscounts) {
    const statusLabel = getStatusLabel({ startsAt: discount.startsAt, endsAt: discount.endsAt, timezone })
    const schedule = tools.describeTimeSchedule({ startsAt: discount.startsAt, endsAt: discount.endsAt, statusLabel, formatDate: tools.formatNaiveDate })
    timeRows.push(tools.buildTimeRow({ discountId: discount.discountId, title: discount.title, schedule, statusLabel, pickTitle: tools.pickRowTitle }))
  }

  return tools.buildDiscountRows({ tierRows, timeRows })
}
