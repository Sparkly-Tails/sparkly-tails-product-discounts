'use client'

import { useEffect, useState } from 'react'
import { fixedPriceNotLowerError } from '@/timeDiscounts/config'

/**
 * The pricing-mode radios + amount input, shared by the create form
 * (NewTimeDiscountForm) and the edit page. Pulled out into its own small
 * client component (both surrounding pages are otherwise server components,
 * or only partially interactive) purely so the amount input's `max="100"`
 * cap can track which mode is actually selected right now — a fixed-price
 * amount has no such cap, so a static max computed only from the initial
 * pricingMode would wrongly block a legitimate fixed price over 100 after
 * the merchant toggles the radio.
 */
export default function PricingAmountFields({
  defaultPricingMode,
  defaultAmount,
  allowFixed = true,
  onAmountChange,
  regularPrice,
  onPricingModeChange,
}: {
  defaultPricingMode: 'percent' | 'fixed'
  defaultAmount?: number
  /**
   * When false, the "Fixed price" radio is hidden entirely and any current
   * selection is reset back to percent — used by the create form, where a
   * mixed-price product/variant selection makes fixed pricing invalid (see
   * NewTimeDiscountForm's `allowFixed`). Defaults to true: the edit page
   * always offers both modes.
   */
  allowFixed?: boolean
  /**
   * Fires with the raw amount input string on every change — used by the
   * create form to gate its submit button. The edit page has no such
   * gating and can omit it.
   */
  onAmountChange?: (value: string) => void
  /**
   * The products'/variants' shared regular price, when known. A fixed price
   * at or above it discounts nothing and is almost certainly a typo, so an
   * error is shown under the input. Omit (or pass null) when unknown —
   * e.g. a collection selection, which the server action checks instead.
   */
  regularPrice?: number | null
  /** Fires when the Percentage/Fixed radio changes, so the create form can gate its submit button on the same error. */
  onPricingModeChange?: (mode: 'percent' | 'fixed') => void
}) {
  const [pricingMode, setPricingMode] = useState<'percent' | 'fixed'>(defaultPricingMode)
  const [amount, setAmount] = useState(defaultAmount !== undefined ? String(defaultAmount) : '')

  // A selection or mode change can invalidate an already-chosen fixed mode
  // (members no longer share one price) — fall back to percent
  // automatically rather than silently submitting an invalid combination.
  // Deliberately a useEffect, not a setState call during render
  // (`{!allowFixed && pricingMode === 'fixed' && setPricingMode('percent')}`)
  // — that pattern is a real anti-pattern (calling a state setter mid-render)
  // and must not be used here even though it would often appear to work.
  useEffect(() => {
    if (!allowFixed && pricingMode === 'fixed') setPricingMode('percent')
  }, [allowFixed, pricingMode])

  useEffect(() => {
    onPricingModeChange?.(pricingMode)
  }, [pricingMode, onPricingModeChange])

  const priceError = fixedPriceNotLowerError(pricingMode, Number(amount), regularPrice)

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
        {allowFixed && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio" name="pricingMode" value="fixed"
              checked={pricingMode === 'fixed'}
              onChange={() => setPricingMode('fixed')}
            />
            Fixed price
          </label>
        )}
      </div>
      <label htmlFor="amount" className="sr-only">Amount</label>
      <input
        id="amount" name="amount" type="number" min="0.01" max={pricingMode === 'percent' ? 100 : undefined} step="0.01" required
        value={amount}
        onChange={(e) => {
          setAmount(e.target.value)
          onAmountChange?.(e.target.value)
        }}
        placeholder={pricingMode === 'percent' ? '% off (e.g. 20)' : 'Price each (e.g. 1.50)'}
        className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
      />
      {priceError && <p role="alert" className="text-xs text-danger mt-2">{priceError}</p>}
      {!allowFixed && (
        <p className="text-xs text-muted mt-2">These products/variants have different prices, so only a percentage discount is available.</p>
      )}
    </>
  )
}
