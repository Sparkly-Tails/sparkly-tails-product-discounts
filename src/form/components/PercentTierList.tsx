import PercentTierRow from '@/form/components/PercentTierRow'
import TierTableHeader from '@/form/components/TierTableHeader'
import { formatMoneyAmount } from '@/home/formatMoney'
import { totalAtThreshold } from '@/lib/tier-math'
import { describePercentTier, isPercentRowComplete, parseAnchorPrice, readCurrencySymbol, type PercentRowValues } from '@/form/tierRows'

const NO_LABELS = { eachLabel: '', offLabel: '' }

// The header and the rows of a percentage discount. A row shows its price each
// only once it is complete and the products have a price to work from.
export default function PercentTierList({ rows, basePrice, currencyCode, isAnchorAllowed, onChange, onRemove }: {
  rows: PercentRowValues[]
  basePrice: number | null
  currencyCode: string
  isAnchorAllowed: boolean
  onChange: (change: { key: string; field: 'minQty' | 'percentOff' | 'anchorPrice'; value: string }) => void
  onRemove: (key: string) => void
}) {
  const formatPrice = (amount: number) => formatMoneyAmount({ amount, currencyCode })
  const buildLabels = (row: PercentRowValues) => (isPercentRowComplete(row)
    ? describePercentTier({ basePrice, minQty: Number(row.minQty), percentOff: Number(row.percentOff), anchorPrice: parseAnchorPrice({ text: row.anchorPrice, isAllowed: isAnchorAllowed }), formatPrice, tools: { totalAtThreshold } })
    : NO_LABELS)
  return (
    <div className="space-y-form-xs">
      <TierTableHeader discountLabel="Discount rate" anchorLabel={isAnchorAllowed ? 'Anchor price' : ''} />
      {rows.map((row, index) => (
        <PercentTierRow
          key={row.key}
          index={index}
          row={row}
          labels={buildLabels(row)}
          currencySymbol={readCurrencySymbol({ currencyCode })}
          isAnchorAllowed={isAnchorAllowed}
          isRemovable={rows.length > 1}
          onChange={(field, value) => onChange({ key: row.key, field, value })}
          onRemove={() => onRemove(row.key)}
        />
      ))}
    </div>
  )
}
