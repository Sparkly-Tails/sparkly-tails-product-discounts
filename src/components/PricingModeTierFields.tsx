'use client'

import { useState } from 'react'
import TierFields from '@/components/TierFields'
import FixedPriceTierFields from '@/components/FixedPriceTierFields'

export default function PricingModeTierFields() {
  const [mode, setMode] = useState<'percent' | 'fixed'>('percent')

  return (
    <div className="space-y-4">
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
      </div>

      {mode === 'percent' ? (
        <>
          <TierFields />
          <p className="text-xs text-muted mt-2">
            Enter percent-off directly. The next screen shows the actual
            resulting price before you go live.
          </p>
        </>
      ) : (
        <>
          <FixedPriceTierFields />
          <p className="text-xs text-muted mt-2">
            Enter the exact price each customer pays per unit at that
            quantity — no percentage math needed.
          </p>
        </>
      )}
    </div>
  )
}
