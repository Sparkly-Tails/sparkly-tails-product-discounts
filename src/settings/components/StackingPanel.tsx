import Card from '@/form/components/Card'
import CheckboxField from '@/form/components/CheckboxField'
import { TouchAppIcon } from '@/form/components/icons'
import type { StackingFlags } from '@/settings/stacking'

const OPTIONS: { field: keyof StackingFlags; label: string; help: string }[] = [
  { field: 'orderDiscounts', label: 'Order discounts', help: 'Discounts on the whole order, such as a code that takes 10% off the order. Allow them to apply together with your tier discounts.' },
  { field: 'shippingDiscounts', label: 'Shipping discounts', help: 'Free or reduced shipping, from a code or an automatic discount. Allow them to apply together with your tier discounts.' },
  { field: 'productDiscounts', label: 'Product discounts', help: 'Other discounts on products. Shopify applies one product discount per cart line, so these can only apply to other lines.' },
]

const FLASH_LOCK_NOTE = 'Always on while a flash sale exists, because flash sales need it.'

// One choice: its box and its help, with the flash note added when the box is locked.
function StackingOption({ label, help, field, checked, isLocked, onChange }: {
  label: string
  help: string
  field: keyof StackingFlags
  checked: boolean
  isLocked: boolean
  onChange: (field: keyof StackingFlags, checked: boolean) => void
}) {
  return (
    <div className="p-4 rounded-2xl bg-form-surface-container-low space-y-1">
      <CheckboxField name={`stack-${field}`} label={label} checked={checked} isStrong isDisabled={isLocked} onChange={(next) => onChange(field, next)} />
      <p className="ml-6.5 text-form-body-sm text-form-on-surface-variant">{isLocked ? `${help} ${FLASH_LOCK_NOTE}` : help}</p>
    </div>
  )
}

// The "Stacking" panel: which other Shopify discounts may apply next to the tier discounts, by discount class.
// The checkbox names are not the form's fields (the hidden inputs are), so a ticked box sends nothing of its own.
export default function StackingPanel({ orderDiscounts, shippingDiscounts, productDiscounts, hasFlash, onChange }: StackingFlags & {
  /** True when a flash sale exists: product discounts are then locked on. */
  hasFlash: boolean
  onChange: (field: keyof StackingFlags, checked: boolean) => void
}) {
  const current: StackingFlags = { orderDiscounts, shippingDiscounts, productDiscounts: productDiscounts || hasFlash }
  return (
    <Card>
      <div className="flex items-center gap-2.5">
        <TouchAppIcon className="text-[20px] text-form-secondary" />
        <div>
          <h2 className="text-form-headline-sm text-form-on-surface">Discount Combination &amp; Stacking</h2>
          <p className="text-form-body-sm text-form-on-surface-variant">Which other discounts may apply together with your tier discounts</p>
        </div>
      </div>
      <p className="text-form-body-sm text-form-on-surface-variant">Two discounts combine only when both allow it, so this also needs to be allowed on the other discount in Shopify.</p>
      <div className="space-y-3">
        {OPTIONS.map((option) => (
          <StackingOption key={option.field} {...option} checked={current[option.field]} isLocked={option.field === 'productDiscounts' && hasFlash} onChange={onChange} />
        ))}
      </div>
    </Card>
  )
}
