import type { CSSProperties } from 'react'
import type { WidgetDot, WidgetStatus, WidgetViewModel } from '@/form/preview/widgetTypes'

function ChipRow({ viewModel, onPickQuantity }: { viewModel: WidgetViewModel; onPickQuantity: (quantity: number) => void }) {
  if (!viewModel.showChips || !viewModel.progressState) return null
  const quantity = viewModel.progressState.combinedQty
  return (
    <div className="sparkly-tier-pricing__tiers" data-tier-pricing-tiers>
      {viewModel.chips.map((chip) => (chip.kind === 'tier' ? (
        <button key={chip.qty + chip.kind} type="button" className={`sparkly-tier-pricing__chip sparkly-tier-pricing__chip--${chip.tone}`} aria-pressed={chip.qty === quantity} onClick={() => onPickQuantity(chip.qty)}>{chip.label}</button>
      ) : (
        <span key={chip.qty + chip.kind} className={`sparkly-tier-pricing__chip sparkly-tier-pricing__chip--current-${chip.tone}`}>{chip.label}</span>
      )))}
    </div>
  )
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
    <div className="sparkly-tier-pricing__rail-card" data-tier-pricing-rail data-offer-state={rail.offerState}>
      <div className="sparkly-tier-pricing__status-row" aria-live="polite" aria-atomic="true">
        <span className="sparkly-tier-pricing__status" data-tier-pricing-status>{status.statusParts.before}<strong>{status.statusParts.strong}</strong>{status.statusParts.after}</span>
        <span className="sparkly-tier-pricing__aside" data-tier-pricing-aside data-tone={status.hintTone}>{status.hintText}</span>
      </div>
      <div className="sparkly-tier-pricing__bar-wrap" data-tier-pricing-bar role="progressbar" aria-label="Discount progress" aria-valuenow={semantics.valueNow} aria-valuemin={semantics.valueMin} aria-valuemax={semantics.valueMax} aria-valuetext={semantics.valueText}>
        <div className="sparkly-tier-pricing__track"><div className="sparkly-tier-pricing__fill" data-tier-pricing-fill style={{ width: `${dot.dotPct}%` }}></div></div>
        <div className="sparkly-tier-pricing__markers" data-tier-pricing-markers>
          {dot.markers.map((marker) => (
            <span key={marker.value} className={`sparkly-tier-pricing__marker${marker.reached ? ' sparkly-tier-pricing__marker--reached' : ''}${marker.covered ? ' sparkly-tier-pricing__marker--covered' : ''}`} style={{ '--sparkly-tier-pct': `${marker.pct}%` } as CSSProperties}>{marker.value}</span>
          ))}
        </div>
        <span className="sparkly-tier-pricing__dot" data-tier-pricing-dot style={{ '--sparkly-tier-pct': `${dot.dotPct}%` } as CSSProperties}>{dot.dotValue}</span>
      </div>
    </div>
  )
}

// The card under the price: the tier chips (which set the quantity) and the progress rail.
export default function TierCardView({ viewModel, onPickQuantity }: { viewModel: WidgetViewModel; onPickQuantity: (quantity: number) => void }) {
  const rail = pickRail(viewModel)
  if (!viewModel.showCard) return null
  return (
    <div className="sparkly-tier-pricing__card" data-tier-pricing-card>
      <ChipRow viewModel={viewModel} onPickQuantity={onPickQuantity} />
      {rail ? <RailView rail={rail} /> : null}
    </div>
  )
}
