import { Fragment } from 'react'
import type { WidgetFlashBar } from '@/form/preview/widgetTypes'

function FlashTimer({ parts }: { parts: string[] }) {
  return (
    <span className="smooth-discounts__flash-timer" data-flash-timer>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? <span className="smooth-discounts__flash-sep">:</span> : null}
          <span className="smooth-discounts__flash-digit">{part}</span>
        </Fragment>
      ))}
    </span>
  )
}

function FlashChip({ text }: { text: string }) {
  if (!text) return null
  return (
    <span className="smooth-discounts__flash-chip" data-flash-chip>
      <span className="smooth-discounts__flash-hourglass" aria-hidden="true"></span>
      <span data-flash-chip-text>{text}</span>
    </span>
  )
}

// The bar at the top of the card, painted the way the storefront script does:
// the sentence, the timer as one box per part, the unit price and the timer chip.
export default function FlashBarView({ bar }: { bar: WidgetFlashBar | null }) {
  if (!bar || bar.variant === 'hidden') return null
  return (
    <div className="smooth-discounts__flash" data-tier-pricing-flash data-variant={bar.variant}>
      <div className="smooth-discounts__flash-main">
        <span className="smooth-discounts__flash-icon" aria-hidden="true"></span>
        <span className="smooth-discounts__flash-label" data-flash-label>{bar.label}</span>
      </div>
      <div className="smooth-discounts__flash-side">
        <FlashTimer parts={bar.timerParts} />
        <span className="smooth-discounts__flash-aside" data-flash-aside>{bar.aside}</span>
        <FlashChip text={bar.chip} />
      </div>
    </div>
  )
}
