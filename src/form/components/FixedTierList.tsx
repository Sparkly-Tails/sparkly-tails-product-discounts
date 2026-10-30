import FixedTierRow from '@/form/components/FixedTierRow'
import TierTableHeader from '@/form/components/TierTableHeader'
import { formatMoneyAmount } from '@/home/formatMoney'
import { clampedFixedPrice } from '@/lib/tier-math'
import { describeFixedTier, isFixedRowComplete, readCurrencySymbol, type FixedRowValues } from '@/form/tierRows'

const NO_LABELS = { eachLabel: '', offLabel: '' }

// The header and the rows of a fixed-price discount.
export default function FixedTierList({ rows, basePrice, currencyCode, onChange, onRemove }: {
  rows: FixedRowValues[]
  basePrice: number | null
  currencyCode: string
  onChange: (change: { key: string; field: 'minQty' | 'fixedPrice'; value: string }) => void
  onRemove: (key: string) => void
}) {
  const formatPrice = (amount: number) => formatMoneyAmount({ amount, currencyCode })
  const buildLabels = (row: FixedRowValues) => (isFixedRowComplete(row)
    ? describeFixedTier({ basePrice, fixedPrice: Number(row.fixedPrice), formatPrice, tools: { clampedFixedPrice } })
    : NO_LABELS)
  return (
    <div className="space-y-form-xs">
      <TierTableHeader discountLabel="Price each" anchorLabel="" />
      {rows.map((row, index) => (
        <FixedTierRow
          key={row.key}
          index={index}
          row={row}
          labels={buildLabels(row)}
          currencySymbol={readCurrencySymbol({ currencyCode })}
          isRemovable={rows.length > 1}
          onChange={(field, value) => onChange({ key: row.key, field, value })}
          onRemove={() => onRemove(row.key)}
        />
      ))}
    </div>
  )
}
