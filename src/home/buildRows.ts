// Builds the rows of the homepage table from the stored discounts, one small
// step at a time. The steps come in through `tools`, so each can be replaced.
import type { DiscountRow, TimeStatusLabel } from '@/home/discountRows'
import type { TierDiscountInput, TimeDiscountInput } from '@/home/loadDiscountRows'
import type { RowTools } from '@/home/rowTools'
import type { FlashStatus } from '@/flash/status'

export type GetFlashStatus = (options: { startsAt: string; endsAt: string; timezone: string }) => FlashStatus

/** The state of a flash sale and the text that shows its window; nothing for a discount that is not a flash sale. */
export function readFlashOfRow({ flash, timezone, getFlashStatus, tools }: {
  flash: { startsAt: string; endsAt: string } | undefined
  timezone: string
  getFlashStatus: GetFlashStatus
  tools: RowTools
}): { status: FlashStatus | null; text: string } {
  if (!flash) return { status: null, text: '' }
  const status = getFlashStatus({ startsAt: flash.startsAt, endsAt: flash.endsAt, timezone })
  return { status, text: tools.describeFlashSchedule({ startsAt: flash.startsAt, endsAt: flash.endsAt, flashStatus: status, formatDate: tools.formatNaiveDate }) }
}

export function buildOneTierRow({ discount, currencyCode, timezone, getFlashStatus, tools }: {
  discount: TierDiscountInput
  currencyCode: string
  timezone: string
  getFlashStatus: GetFlashStatus
  tools: RowTools
}): DiscountRow {
  const steps = tools.listTierSteps({ tiers: discount.tiers, pricingMode: discount.pricingMode })
  const tierRules = tools.describeTierRules({ steps, pricingMode: discount.pricingMode, currencyCode, formatMoney: tools.formatMoneyAmount })
  const flash = tools.readFlashOfRow({ flash: discount.flash, timezone, getFlashStatus, tools })
  return tools.buildTierRow({
    discountId: discount.discountId,
    name: discount.name,
    title: discount.title,
    status: discount.status,
    rules: tools.joinRuleTexts({ parts: [tierRules, flash.text] }),
    flashStatus: flash.status,
    pickTitle: tools.pickRowTitle,
    pickSubtitle: tools.pickRowSubtitle,
  })
}

export function buildTierRows({ discounts, currencyCode, timezone, getFlashStatus, tools }: {
  discounts: TierDiscountInput[]
  currencyCode: string
  timezone: string
  getFlashStatus: GetFlashStatus
  tools: RowTools
}): DiscountRow[] {
  const rows: DiscountRow[] = []
  for (const discount of discounts) rows.push(tools.buildOneTierRow({ discount, currencyCode, timezone, getFlashStatus, tools }))
  return rows
}

export function buildTimeRows({ discounts, timezone, getStatusLabel, tools }: {
  discounts: TimeDiscountInput[]
  timezone: string
  getStatusLabel: (options: { startsAt: string; endsAt: string; timezone: string }) => TimeStatusLabel
  tools: RowTools
}): DiscountRow[] {
  const rows: DiscountRow[] = []
  for (const discount of discounts) {
    const statusLabel = getStatusLabel({ startsAt: discount.startsAt, endsAt: discount.endsAt, timezone })
    const schedule = tools.describeTimeSchedule({ startsAt: discount.startsAt, endsAt: discount.endsAt, statusLabel, formatDate: tools.formatNaiveDate })
    rows.push(tools.buildTimeRow({ discountId: discount.discountId, title: discount.title, schedule, statusLabel, pickTitle: tools.pickRowTitle }))
  }
  return rows
}
