import Card from '@/form/components/Card'
import { TouchAppIcon } from '@/form/components/icons'
import type { PopupFrequency } from '@/settings/frequency'

const OPTIONS: { value: PopupFrequency; label: string; help: string }[] = [
  { value: 'session', label: 'Once per shopping session', help: 'The pop-up shows the first time a shopper goes from the cart to checkout.' },
  { value: 'checkout', label: 'At every cart-to-checkout press until the tier is unlocked', help: 'The pop-up shows on every press until the shopper has reached the tier.' },
]

// The "Impression Frequency" panel: how often the pre-checkout pop-up shows the bundle, for the whole store.
export default function FrequencyPanel({ frequency, onChange }: { frequency: PopupFrequency; onChange: (frequency: PopupFrequency) => void }) {
  return (
    <Card>
      <div className="flex items-center gap-2.5">
        <TouchAppIcon className="text-[20px] text-form-secondary" />
        <div>
          <h2 className="text-form-headline-sm text-form-on-surface">Impression Frequency</h2>
          <p className="text-form-body-sm text-form-on-surface-variant">How often the pre-checkout pop-up shows the bundle</p>
        </div>
      </div>
      <div className="space-y-3">
        {OPTIONS.map((option) => (
          <label key={option.value} className="flex items-start gap-2.5 cursor-pointer">
            <input type="radio" name="frequencyOption" aria-label={option.label} value={option.value} checked={frequency === option.value} onChange={() => onChange(option.value)} className="mt-1 accent-form-secondary" />
            <span>
              <span className="block text-form-label-md text-form-on-surface font-medium">{option.label}</span>
              <span className="block text-form-body-sm text-form-on-surface-variant">{option.help}</span>
            </span>
          </label>
        ))}
      </div>
    </Card>
  )
}
