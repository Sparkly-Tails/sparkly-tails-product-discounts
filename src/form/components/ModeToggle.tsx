'use client'

export type PricingMode = 'percent' | 'fixed'

const SELECTED = 'bg-form-surface-container-lowest text-form-on-surface font-semibold shadow-xs'
const UNSELECTED = 'text-form-on-surface-variant font-medium hover:text-form-on-surface'

function Segment({ value, label, isChecked, isDisabled, onChange }: {
  value: PricingMode
  label: string
  isChecked: boolean
  isDisabled: boolean
  onChange: () => void
}) {
  return (
    <label className={['px-form-md py-1 rounded-lg text-form-label-sm transition-all', isChecked ? SELECTED : UNSELECTED, isDisabled ? 'opacity-40' : 'cursor-pointer'].join(' ')}>
      <input type="radio" name="pricingMode" value={value} checked={isChecked} disabled={isDisabled} onChange={onChange} className="sr-only" />
      {label}
    </label>
  )
}

// The switch between a percentage off and a fixed price. Fixed price needs
// every product to cost the same, so it is off when they do not.
export default function ModeToggle({ mode, isFixedAllowed, onChange }: { mode: PricingMode; isFixedAllowed: boolean; onChange: (mode: PricingMode) => void }) {
  return (
    <div className="inline-flex items-center p-1 rounded-lg bg-form-surface-container">
      <Segment value="percent" label="Percentage off" isChecked={mode === 'percent'} isDisabled={false} onChange={() => onChange('percent')} />
      <Segment value="fixed" label="Fixed price" isChecked={mode === 'fixed'} isDisabled={!isFixedAllowed} onChange={() => onChange('fixed')} />
    </div>
  )
}
