import type { FixedRowValues, TierPriceLabels } from '@/form/tierRows'

const INPUT = 'h-9 rounded-lg bg-form-surface-container-lowest border border-form-outline-variant/60 text-form-on-surface focus:outline-none'

// One tier of a fixed-price discount: the quantity, the price each with what it
// comes to, and Remove. It sits in the same columns as a percentage row.
export default function FixedTierRow({ index, row, labels, currencySymbol, isRemovable, onChange, onRemove }: {
  index: number
  row: FixedRowValues
  labels: TierPriceLabels
  currencySymbol: string
  isRemovable: boolean
  onChange: (field: 'minQty' | 'fixedPrice', value: string) => void
  onRemove: () => void
}) {
  const label = `Tier ${index + 1}`
  const nameOf = (field: string) => `tier-${index}-${field}`
  return (
    <div className="grid grid-cols-12 gap-form-sm items-center p-3 rounded-lg bg-form-surface-container-low hover:bg-form-surface-container transition-colors border border-form-outline-variant/20">
      <div className="col-span-3 flex items-center gap-1.5">
        <label htmlFor={nameOf('minQty')} className="sr-only">{label} minimum quantity</label>
        <input id={nameOf('minQty')} name={nameOf('minQty')} type="number" min="1" value={row.minQty} onChange={(event) => onChange('minQty', event.target.value)} className={`${INPUT} w-14 px-2 text-center text-form-label-md`} />
        <span className="text-form-body-sm text-form-on-surface-variant truncate">units</span>
      </div>
      <div className="col-span-4 flex items-center gap-2">
        <div className="relative flex items-center">
          <span className="absolute left-2.5 text-form-label-sm text-form-on-surface-variant pointer-events-none">{currencySymbol}</span>
          <label htmlFor={nameOf('fixedPrice')} className="sr-only">{label} price each</label>
          <input id={nameOf('fixedPrice')} name={nameOf('fixedPrice')} type="number" min="0" step="0.01" value={row.fixedPrice} onChange={(event) => onChange('fixedPrice', event.target.value)} className={`${INPUT} w-24 pl-6 pr-2 text-right text-form-label-md`} />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-form-label-sm text-form-on-tertiary-container font-semibold">{labels.eachLabel}</span>
          <span className="text-[11px] text-form-on-surface-variant">{labels.offLabel}</span>
        </div>
      </div>
      <div className="col-span-3"></div>
      <div className="col-span-2 flex justify-end">
        <button type="button" onClick={onRemove} disabled={!isRemovable} aria-label={`Remove tier ${index + 1}`} className="text-form-label-sm text-form-error hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity font-medium px-2 py-1 rounded">Remove</button>
      </div>
    </div>
  )
}
