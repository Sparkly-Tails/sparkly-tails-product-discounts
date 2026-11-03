import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { CHIP_SCROLL } from '@/form/preview/chipScroll'
import type { WidgetDot, WidgetStatus, WidgetViewModel } from '@/form/preview/widgetTypes'

// The row of boxes scrolls sideways; when the quantity (or the tiers) change, the active box is moved into view.
function ChipButtons({ viewModel, quantity, onPickQuantity }: { viewModel: WidgetViewModel; quantity: number; onPickQuantity: (quantity: number) => void }) {
  const rowRef = useRef<HTMLDivElement>(null)
  const chipsKey = viewModel.chips.map((chip) => chip.label).join('|')
  useLayoutEffect(() => {
    if (rowRef.current) CHIP_SCROLL.scrollActiveChipIntoView({ tiersEl: rowRef.current, tools: CHIP_SCROLL.CHIP_SCROLL_TOOLS })
  }, [quantity, chipsKey])
  return (
    <div ref={rowRef} className="smooth-discounts__tiers" data-tier-pricing-tiers>
      {viewModel.chips.map((chip) => (chip.kind === 'tier' ? (
        <button key={chip.qty + chip.kind} type="button" className={`smooth-discounts__chip smooth-discounts__chip--${chip.tone}`} aria-pressed={chip.qty === quantity} onClick={() => onPickQuantity(chip.qty)}>{chip.label}</button>
      ) : (
        <span key={chip.qty + chip.kind} className={`smooth-discounts__chip smooth-discounts__chip--current-${chip.tone}`}>{chip.label}</span>
      )))}
    </div>
  )
}

function ChipRow({ viewModel, onPickQuantity }: { viewModel: WidgetViewModel; onPickQuantity: (quantity: number) => void }) {
  if (!viewModel.showChips || !viewModel.progressState) return null
  return <ChipButtons viewModel={viewModel} quantity={viewModel.progressState.combinedQty} onPickQuantity={onPickQuantity} />
}

export interface Rail {
  status: WidgetStatus
  dot: WidgetDot
  semantics: NonNullable<WidgetViewModel['semantics']>
  offerState: string
}

/** The parts of the progress rail, or null when the widget has not decided on all of them. */
export function pickRail(viewModel: WidgetViewModel): Rail | null {
  const { status, dot, semantics, offerState } = viewModel
  return [status, dot, semantics].every(Boolean) ? ({ status, dot, semantics, offerState: offerState ?? 'progress' } as Rail) : null
}

function RailView({ rail }: { rail: Rail }) {
  const { status, dot, semantics } = rail
  return (
    <div className="smooth-discounts__rail-card" data-tier-pricing-rail data-offer-state={rail.offerState}>
      <div className="smooth-discounts__status-row" aria-live="polite" aria-atomic="true">
        <span className="smooth-discounts__status" data-tier-pricing-status>{status.statusParts.before}<strong>{status.statusParts.strong}</strong>{status.statusParts.after}</span>
        <span className="smooth-discounts__aside" data-tier-pricing-aside data-tone={status.hintTone}>{status.hintText}</span>
      </div>
      <div className="smooth-discounts__bar-wrap" data-tier-pricing-bar role="progressbar" aria-label="Discount progress" aria-valuenow={semantics.valueNow} aria-valuemin={semantics.valueMin} aria-valuemax={semantics.valueMax} aria-valuetext={semantics.valueText}>
        <div className="smooth-discounts__track"><div className="smooth-discounts__fill" data-tier-pricing-fill style={{ width: `${dot.dotPct}%` }}></div></div>
        <div className="smooth-discounts__markers" data-tier-pricing-markers>
          {dot.markers.map((marker) => (
            <span key={marker.value} className={`smooth-discounts__marker${marker.reached ? ' smooth-discounts__marker--reached' : ''}${marker.covered ? ' smooth-discounts__marker--covered' : ''}`} style={{ '--smooth-discounts-pct': `${marker.pct}%` } as CSSProperties}>{marker.value}</span>
          ))}
        </div>
        <span className="smooth-discounts__dot" data-tier-pricing-dot style={{ '--smooth-discounts-pct': `${dot.dotPct}%` } as CSSProperties}>{dot.dotValue}</span>
      </div>
    </div>
  )
}

// The card under the price: the tier chips (which set the quantity) and the progress rail.
export default function TierCardView({ viewModel, onPickQuantity }: { viewModel: WidgetViewModel; onPickQuantity: (quantity: number) => void }) {
  const rail = pickRail(viewModel)
  if (!viewModel.showCard) return null
  return (
    <div className="smooth-discounts__card" data-tier-pricing-card>
      <ChipRow viewModel={viewModel} onPickQuantity={onPickQuantity} />
      {rail ? <RailView rail={rail} /> : null}
    </div>
  )
}
