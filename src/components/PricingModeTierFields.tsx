'use client'

import { useEffect, useState } from 'react'
import TierFields from '@/components/TierFields'
import FixedPriceTierFields from '@/components/FixedPriceTierFields'

export default function PricingModeTierFields({
  allowPriceBasedModes,
  initial,
  onTiersValidChange,
}: {
  allowPriceBasedModes: boolean
  initial?: {
    percentTiers?: { minQty: number; percentOff: number; anchorPrice?: number }[]
    fixedTiers?: { minQty: number; fixedPrice: number }[]
    startMode?: 'percent' | 'fixed'
  }
  /** Fires whenever the currently-active mode's tier rows go from having a complete one to not (or back). */
  onTiersValidChange?: (valid: boolean) => void
}) {
  const [mode, setMode] = useState<'percent' | 'fixed'>(
    allowPriceBasedModes ? (initial?.startMode ?? 'percent') : 'percent',
  )

  // If membership changes after mount (e.g. the picker adds a
  // differently-priced member) and fixed mode is no longer valid, fall
  // back to percent rather than leaving an invalid mode selected.
  useEffect(() => {
    if (!allowPriceBasedModes && mode === 'fixed') setMode('percent')
  }, [allowPriceBasedModes, mode])

  return (
    <div className="space-y-4">
      {!allowPriceBasedModes && (
        <p className="text-xs text-muted">
          These products/variants have different prices, so only a percentage discount is available.
        </p>
      )}

      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="pricingMode"
            value="percent"
            checked={mode === 'percent'}
            onChange={() => setMode('percent')}
          />
          Percentage off
        </label>
        {allowPriceBasedModes && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="pricingMode"
              value="fixed"
              checked={mode === 'fixed'}
              onChange={() => setMode('fixed')}
            />
            Fixed price
          </label>
        )}
      </div>

      {mode === 'percent' ? (
        <>
          <TierFields initial={initial?.percentTiers} allowAnchorPrice={allowPriceBasedModes} onValidityChange={onTiersValidChange} />
          <p className="text-xs text-muted mt-2">
            Enter percent-off directly. The next screen shows the actual
            resulting price before you go live.
          </p>
        </>
      ) : (
        <>
          <FixedPriceTierFields initial={initial?.fixedTiers} onValidityChange={onTiersValidChange} />
          <p className="text-xs text-muted mt-2">
            Enter the exact price each customer pays per unit at that
            quantity — no percentage math needed.
          </p>
        </>
      )}
    </div>
  )
}
