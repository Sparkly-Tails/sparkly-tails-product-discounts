'use client'

import { useState } from 'react'

/**
 * The pricing-mode radios + amount input on the time-discount edit page.
 * Pulled out into its own small client component (the surrounding page is
 * a server component with no other interactivity) purely so the amount
 * input's `max="100"` cap can track which mode is actually selected right
 * now — a fixed-price amount has no such cap, so a static max computed
 * only from the discount's initial pricingMode would wrongly block a
 * legitimate fixed price over 100 after the merchant toggles the radio.
 */
export default function PricingAmountFields({
  defaultPricingMode,
  defaultAmount,
}: {
  defaultPricingMode: 'percent' | 'fixed'
  defaultAmount: number
}) {
  const [pricingMode, setPricingMode] = useState<'percent' | 'fixed'>(defaultPricingMode)

  return (
    <>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio" name="pricingMode" value="percent"
            checked={pricingMode === 'percent'}
            onChange={() => setPricingMode('percent')}
          />
          Percentage off
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio" name="pricingMode" value="fixed"
            checked={pricingMode === 'fixed'}
            onChange={() => setPricingMode('fixed')}
          />
          Fixed price
        </label>
      </div>
      <label htmlFor="amount" className="sr-only">Amount</label>
      <input
        id="amount" name="amount" type="number" min="0.01" max={pricingMode === 'percent' ? 100 : undefined} step="0.01" required
        defaultValue={defaultAmount}
        className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
      />
    </>
  )
}
