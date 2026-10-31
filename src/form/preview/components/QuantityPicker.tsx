import { clampQuantity, readQuantity } from '@/form/preview/previewModel'

const STEP_BUTTON = 'w-10 h-full text-[18px] leading-none text-form-on-surface hover:bg-form-surface-container-low transition-colors disabled:text-form-outline disabled:hover:bg-transparent'

// The quantity of the preview: how many units the shopper would have chosen. The tier
// chips of the widget change it too, and the widget shows what that quantity gets.
export default function QuantityPicker({ quantity, onChange }: { quantity: number; onChange: (quantity: number) => void }) {
  return (
    <div>
      <label htmlFor="preview-quantity" className="text-form-label-sm text-form-on-surface-variant font-medium">Quantity</label>
      <div className="mt-1.5 inline-flex items-center h-10 rounded-lg bg-form-surface-container-low border border-form-outline-variant/40 overflow-hidden">
        <button type="button" aria-label="Decrease quantity" disabled={quantity <= 1} onClick={() => onChange(clampQuantity({ value: quantity - 1 }))} className={STEP_BUTTON}>−</button>
        <input
          id="preview-quantity"
          type="number"
          inputMode="numeric"
          min={1}
          value={quantity}
          onChange={(event) => {
            const typed = readQuantity({ text: event.target.value, tools: { clampQuantity } })
            if (typed !== null) onChange(typed)
          }}
          className="w-14 h-full text-center text-form-body-md text-form-on-surface bg-transparent border-x border-form-outline-variant/40 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button type="button" aria-label="Increase quantity" onClick={() => onChange(clampQuantity({ value: quantity + 1 }))} className={STEP_BUTTON}>+</button>
      </div>
    </div>
  )
}
