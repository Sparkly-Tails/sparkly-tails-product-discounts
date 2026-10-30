import { formatMoneyAmount } from '@/home/formatMoney'
import type { ProductVariantOption } from '@/lib/products'

// The variants of a product that has several, to choose one by one.
export default function VariantList({ productTitle, options, currencyCode, onPick, onDone }: {
  productTitle: string
  options: ProductVariantOption[]
  currencyCode: string
  onPick: (option: ProductVariantOption) => void
  onDone: () => void
}) {
  return (
    <div className="p-3 rounded-lg bg-form-surface-container-low border border-form-outline-variant/20 space-y-form-xs">
      <p className="text-form-label-md text-form-on-surface">{productTitle}: choose variants</p>
      {options.map((option) => (
        <button
          key={option.variantId}
          type="button"
          onClick={() => onPick(option)}
          className="w-full text-left px-3 py-2 rounded-lg bg-form-surface-container-lowest border border-form-outline-variant/40 hover:border-form-secondary text-form-body-md text-form-on-surface transition-colors"
        >
          {option.title} — {formatMoneyAmount({ amount: option.price, currencyCode })}
        </button>
      ))}
      <button type="button" onClick={onDone} className="text-form-label-sm text-form-on-surface-variant hover:text-form-on-surface">Done</button>
    </div>
  )
}
