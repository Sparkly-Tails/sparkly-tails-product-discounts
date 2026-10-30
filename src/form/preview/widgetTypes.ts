// The shapes the storefront widget's script (tier-pricing.js) works with, as far as the admin preview uses them.
import type { PreviewTier } from '@/form/tierRows'

/** The flash sale window the widget reads, in Unix seconds. */
export interface WidgetFlash {
  startsAtUnix: number
  endsAtUnix: number
  showTeaser: boolean
}

export interface WidgetFlashBar {
  variant: 'hidden' | 'teaser' | 'ends' | 'tier-first' | 'tier-higher'
  text: string
  label: string
  timerParts: string[]
  aside: string
  chip: string
}

export interface WidgetChip {
  kind: 'tier' | 'current'
  qty: number
  label: string
  tone: string
}

export interface WidgetStatus {
  statusText: string
  statusParts: { before: string; strong: string; after: string }
  hintText: string
  hintTone: string
}

export interface WidgetDot {
  dotValue: number
  dotPct: number
  markers: { value: number; pct: number; reached: boolean; covered: boolean }[]
}

/** What the widget decides to show: the preview paints it and decides nothing. */
export interface WidgetViewModel {
  showCard: boolean
  showChips: boolean
  showDrawer: boolean
  showChrome: boolean
  flashBar: WidgetFlashBar | null
  discountedPrice: string | null
  plainPrice: string
  priceLabel: string | null
  progressState: { combinedQty: number } | null
  chips: WidgetChip[]
  tag: { kind: 'tier' | 'high-demand'; text: string } | null
  offerState: string | null
  dot: WidgetDot | null
  promoLine: string
  status: WidgetStatus | null
  semantics: { valueNow: number; valueMin: number; valueMax: number; valueText: string } | null
}

export interface ComputeViewModelOptions {
  tiers: PreviewTier[]
  basePrice: number
  compareAtPrice: number | null
  otherQty: number
  addingQty: number
  isGroup: boolean
  highDemand: boolean
  flash: WidgetFlash | null
  nowSeconds: number
  formatMoney: (amount: number) => string
}

export interface WidgetFunctions {
  computeWidgetViewModel: (options: ComputeViewModelOptions) => WidgetViewModel
  withUnitAnchor: (tiers: PreviewTier[]) => PreviewTier[]
  formatMoney: (amount: number, format: string) => string
}
