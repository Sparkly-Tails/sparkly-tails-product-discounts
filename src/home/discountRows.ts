// The rows of the homepage "All discounts" table, built from plain values.
// Collaborators (text formatters, title pickers) are passed in, so each
// function here is a small pure step.

export interface DiscountRow {
  key: string
  kind: 'tier' | 'time'
  title: string
  subtitle: string
  rules: string
  isActive: boolean
  href: string
}

export type TimeStatusLabel = 'Upcoming' | 'Active' | 'Expired'

const AMOUNT_KEY = { percent: 'percentOff', fixed: 'fixedPrice' } as const

// The quantity and amount of each tier: the percent in percent mode, the unit
// price in fixed mode (0 when the tier has none).
export function listTierSteps({ tiers, pricingMode }: {
  tiers: { minQty: number; percentOff?: number; fixedPrice?: number }[]
  pricingMode: 'percent' | 'fixed'
}): { minQty: number; amount: number }[] {
  const steps: { minQty: number; amount: number }[] = []
  for (const tier of tiers) steps.push({ minQty: tier.minQty, amount: tier[AMOUNT_KEY[pricingMode]] ?? 0 })
  return steps
}

// "3+ units (10% off), 5+ units (20% off)" or "3+ units (£1.50 each)".
export function describeTierRules(options: {
  steps: { minQty: number; amount: number }[]
  pricingMode: 'percent' | 'fixed'
  currencyCode: string
  formatMoney: (options: { amount: number; currencyCode: string }) => string
}): string {
  const { steps, pricingMode, currencyCode, formatMoney } = options
  const parts: string[] = []
  for (const step of [...steps].sort((first, second) => first.minQty - second.minQty)) {
    const amountText = pricingMode === 'percent' ? step.amount + '% off' : formatMoney({ amount: step.amount, currencyCode }) + ' each'
    parts.push(step.minQty + '+ units (' + amountText + ')')
  }
  return parts.join(', ')
}

// Upcoming: the whole window; Active: when it ends; Expired: when it ended.
export function describeTimeSchedule(options: {
  startsAt: string
  endsAt: string
  statusLabel: TimeStatusLabel
  formatDate: (options: { value: string }) => string
}): string {
  const { startsAt, endsAt, statusLabel, formatDate } = options
  if (statusLabel === 'Upcoming') return formatDate({ value: startsAt }) + ' - ' + formatDate({ value: endsAt }) + ' (Scheduled)'
  if (statusLabel === 'Active') return 'Ends ' + formatDate({ value: endsAt })
  return 'Ended ' + formatDate({ value: endsAt })
}

// The row title: the name, else the customer-facing title, else a placeholder.
export function pickRowTitle({ name, title }: { name: string; title: string }): string {
  return name.trim() || title.trim() || 'Untitled discount'
}

// The line under the title: the customer-facing title when it adds something.
export function pickRowSubtitle({ rowTitle, title }: { rowTitle: string; title: string }): string {
  const text = title.trim()
  return text === rowTitle ? '' : text
}

export function buildTierRow(options: {
  discountId: string
  name: string
  title: string
  status: 'draft' | 'live'
  rules: string
  pickTitle: (options: { name: string; title: string }) => string
  pickSubtitle: (options: { rowTitle: string; title: string }) => string
}): DiscountRow {
  const { discountId, name, title, status, rules, pickTitle, pickSubtitle } = options
  const rowTitle = pickTitle({ name, title })
  return {
    key: 'tier:' + discountId,
    kind: 'tier',
    title: rowTitle,
    subtitle: pickSubtitle({ rowTitle, title }),
    rules,
    isActive: status === 'live',
    href: '/discounts/' + encodeURIComponent(discountId),
  }
}

export function buildTimeRow(options: {
  discountId: string
  title: string
  schedule: string
  statusLabel: TimeStatusLabel
  pickTitle: (options: { name: string; title: string }) => string
}): DiscountRow {
  const { discountId, title, schedule, statusLabel, pickTitle } = options
  return {
    key: 'time:' + discountId,
    kind: 'time',
    title: pickTitle({ name: title, title: '' }),
    subtitle: '',
    rules: schedule,
    isActive: statusLabel === 'Active',
    href: '/time-discounts/' + encodeURIComponent(discountId),
  }
}

// Tier rows first, then the time-based rows, each in stored order.
export function buildDiscountRows({ tierRows, timeRows }: { tierRows: DiscountRow[]; timeRows: DiscountRow[] }): DiscountRow[] {
  return [...tierRows, ...timeRows]
}
