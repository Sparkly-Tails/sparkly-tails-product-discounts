'use client'

const controlClass =
  'border border-line rounded px-2 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'

/** The group's one shared rule: a type and an amount. The page owns the values. */
export default function GroupRuleFields({
  pricingMode, amountText, problem, onChange, disabled,
}: {
  pricingMode: 'percent' | 'fixed'
  amountText: string
  /** Why the rule cannot be saved, or null. */
  problem: string | null
  onChange: (pricingMode: 'percent' | 'fixed', amountText: string) => void
  disabled?: boolean
}) {
  const amountLabel = pricingMode === 'percent' ? 'Percent off' : 'Fixed price'
  return (
    <section className="mb-8">
      <h2 className="font-medium mb-2">Shared price</h2>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="group-pricing-mode" className="block text-sm font-medium mb-2">Discount type</label>
          <select
            id="group-pricing-mode" value={pricingMode} disabled={disabled}
            onChange={(e) => onChange(e.target.value === 'fixed' ? 'fixed' : 'percent', amountText)}
            className={controlClass}
          >
            <option value="percent">Percentage off</option>
            <option value="fixed">Fixed price</option>
          </select>
        </div>
        <div>
          <label htmlFor="group-amount" className="block text-sm font-medium mb-2">{amountLabel}</label>
          <input
            id="group-amount" type="number" min="0.01" max={pricingMode === 'percent' ? 100 : undefined} step="0.01"
            placeholder={pricingMode === 'percent' ? '% off (e.g. 20)' : 'Price each (e.g. 1.50)'}
            value={amountText} disabled={disabled}
            onChange={(e) => onChange(pricingMode, e.target.value)}
            className={`${controlClass} w-36`}
          />
        </div>
      </div>
      {problem && <p role="alert" className="text-xs text-danger mt-2">{problem}</p>}
    </section>
  )
}
