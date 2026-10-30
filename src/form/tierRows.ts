// The rows of the tiers table as the person types them (text), what makes a
// row complete, and what the form and the preview take from them.
import type { clampedFixedPrice, totalAtThreshold } from '@/lib/tier-math'

export interface PercentRowValues {
  key: string
  minQty: string
  percentOff: string
  /** Optional: the exact total for the minimum quantity. */
  anchorPrice: string
}

export interface FixedRowValues {
  key: string
  minQty: string
  fixedPrice: string
}

/** A complete tier, as the preview and the save action use it. */
export interface PreviewTier {
  minQty: number
  percentOff?: number
  fixedPrice?: number
  anchorPrice?: number
}

/** True once a row has enough filled in that the server accepts it as a tier. */
export function isPercentRowComplete(row: PercentRowValues): boolean {
  return Number(row.minQty) > 0 && row.percentOff.trim() !== '' && Number(row.percentOff) >= 0
}

export function isFixedRowComplete(row: FixedRowValues): boolean {
  return Number(row.minQty) > 0 && Number(row.fixedPrice) > 0
}

export function parseAnchorPrice({ text, isAllowed }: { text: string; isAllowed: boolean }): number | undefined {
  return isAllowed && text.trim() !== '' ? Number(text) : undefined
}

export function buildPercentTiers({ rows, isAnchorAllowed, tools }: {
  rows: PercentRowValues[]
  isAnchorAllowed: boolean
  tools: { isPercentRowComplete: typeof isPercentRowComplete; parseAnchorPrice: typeof parseAnchorPrice }
}): PreviewTier[] {
  const tiers: PreviewTier[] = []
  for (const row of rows) {
    if (tools.isPercentRowComplete(row)) {
      tiers.push({ minQty: Number(row.minQty), percentOff: Number(row.percentOff), anchorPrice: tools.parseAnchorPrice({ text: row.anchorPrice, isAllowed: isAnchorAllowed }) })
    }
  }
  return tiers.sort((first, second) => first.minQty - second.minQty)
}

export function buildFixedTiers({ rows, tools }: { rows: FixedRowValues[]; tools: { isFixedRowComplete: typeof isFixedRowComplete } }): PreviewTier[] {
  const tiers: PreviewTier[] = []
  for (const row of rows) if (tools.isFixedRowComplete(row)) tiers.push({ minQty: Number(row.minQty), fixedPrice: Number(row.fixedPrice) })
  return tiers.sort((first, second) => first.minQty - second.minQty)
}

export interface TierPriceLabels {
  eachLabel: string
  offLabel: string
}

const NO_LABELS: TierPriceLabels = { eachLabel: '', offLabel: '' }

/** "$25.20 ea" and "10% off" under a percentage tier; the percentage is worked out again when an anchor price sets the total. */
export function describePercentTier({ basePrice, minQty, percentOff, anchorPrice, formatPrice, tools }: {
  basePrice: number | null
  minQty: number
  percentOff: number
  anchorPrice: number | undefined
  formatPrice: (amount: number) => string
  tools: { totalAtThreshold: typeof totalAtThreshold }
}): TierPriceLabels {
  if (!basePrice) return NO_LABELS
  const unitPrice = tools.totalAtThreshold(basePrice, { minQty, percentOff, anchorPrice }) / minQty
  const effectivePercent = anchorPrice === undefined ? percentOff : Math.round((1 - unitPrice / basePrice) * 1000) / 10
  return { eachLabel: `${formatPrice(unitPrice)} ea`, offLabel: `${effectivePercent}% off` }
}

/** "$21.00 ea" and "25% off" under a fixed-price tier (never above the product's own price). */
export function describeFixedTier({ basePrice, fixedPrice, formatPrice, tools }: {
  basePrice: number | null
  fixedPrice: number
  formatPrice: (amount: number) => string
  tools: { clampedFixedPrice: typeof clampedFixedPrice }
}): TierPriceLabels {
  if (!basePrice) return NO_LABELS
  const unitPrice = tools.clampedFixedPrice(basePrice, fixedPrice)
  return { eachLabel: `${formatPrice(unitPrice)} ea`, offLabel: `${Math.round((1 - unitPrice / basePrice) * 1000) / 10}% off` }
}

/** Rows of text from the saved percentage tiers; `makeKey` gives each row its own key. */
export function buildPercentRows({ tiers, makeKey }: {
  tiers: { minQty: number; percentOff: number; anchorPrice?: number }[]
  makeKey: () => string
}): PercentRowValues[] {
  const rows: PercentRowValues[] = []
  for (const tier of tiers) {
    rows.push({ key: makeKey(), minQty: String(tier.minQty), percentOff: String(tier.percentOff), anchorPrice: tier.anchorPrice === undefined ? '' : String(tier.anchorPrice) })
  }
  return rows
}

export function buildFixedRows({ tiers, makeKey }: { tiers: { minQty: number; fixedPrice: number }[]; makeKey: () => string }): FixedRowValues[] {
  const rows: FixedRowValues[] = []
  for (const tier of tiers) rows.push({ key: makeKey(), minQty: String(tier.minQty), fixedPrice: String(tier.fixedPrice) })
  return rows
}

/** The rows with one field of the row that has this key replaced. */
export function updateRow<Row extends { key: string }>({ rows, key, field, value }: { rows: Row[]; key: string; field: keyof Row; value: string }): Row[] {
  const next: Row[] = []
  for (const row of rows) next.push(row.key === key ? { ...row, [field]: value } : row)
  return next
}

export function keepOtherRows<Row extends { key: string }>({ rows, key }: { rows: Row[]; key: string }): Row[] {
  const kept: Row[] = []
  for (const row of rows) if (row.key !== key) kept.push(row)
  return kept
}

/** "$", "£", "€" for the shop's currency code. */
export function readCurrencySymbol({ currencyCode }: { currencyCode: string }): string {
  const parts = new Intl.NumberFormat('en', { style: 'currency', currency: currencyCode, currencyDisplay: 'narrowSymbol' }).formatToParts(0)
  return parts.find((part) => part.type === 'currency')?.value ?? currencyCode
}
