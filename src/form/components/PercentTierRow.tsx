import type { PercentRowValues, TierPriceLabels } from '@/form/tierRows'

const INPUT = 'h-9 rounded-lg bg-form-surface-container-lowest border border-form-outline-variant/60 text-form-on-surface focus:outline-none'

// One tier of a percentage discount: the quantity, the percentage with what it
// comes to, the optional anchor price (the exact total for that quantity) and Remove.
export default function PercentTierRow({ index, row, labels, currencySymbol, isAnchorAllowed, isRemovable, onChange, onRemove }: {
  index: number
  row: PercentRowValues
  labels: TierPriceLabels
  currencySymbol: string
  isAnchorAllowed: boolean
  isRemovable: boolean
  onChange: (field: 'minQty' | 'percentOff' | 'anchorPrice', value: string) => void
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
          <label htmlFor={nameOf('percentOff')} className="sr-only">{label} percent off</label>
          <input id={nameOf('percentOff')} name={nameOf('percentOff')} type="number" min="0" max="100" step="0.1" value={row.percentOff} onChange={(event) => onChange('percentOff', event.target.value)} className={`${INPUT} w-16 pl-2 pr-6 text-right text-form-label-md`} />
          <span className="absolute right-2 text-form-label-sm text-form-on-surface-variant pointer-events-none">%</span>
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-form-label-sm text-form-on-tertiary-container font-semibold">{labels.eachLabel}</span>
          <span className="text-[11px] text-form-on-surface-variant">{labels.offLabel}</span>
        </div>
      </div>
      <div className="col-span-3 flex items-center">
        {isAnchorAllowed ? (
          <div className="relative w-full max-w-[110px]">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-form-label-sm text-form-on-surface-variant">{currencySymbol}</span>
            <label htmlFor={nameOf('anchorPrice')} className="sr-only">{label} anchor price (optional)</label>
            <input id={nameOf('anchorPrice')} name={nameOf('anchorPrice')} type="number" min="0" step="0.01" value={row.anchorPrice} onChange={(event) => onChange('anchorPrice', event.target.value)} className={`${INPUT} w-full pl-6 pr-2 text-form-body-md`} />
          </div>
        ) : null}
      </div>
      <div className="col-span-2 flex justify-end">
        <button type="button" onClick={onRemove} disabled={!isRemovable} aria-label={`Remove tier ${index + 1}`} className="text-form-label-sm text-form-error hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity font-medium px-2 py-1 rounded">Remove</button>
      </div>
    </div>
  )
}
