'use client'

import { useEffect, useState } from 'react'
import AddTierButton from '@/form/components/AddTierButton'
import Card from '@/form/components/Card'
import FixedTierList from '@/form/components/FixedTierList'
import ModeToggle, { type PricingMode } from '@/form/components/ModeToggle'
import PercentOnlyNote from '@/form/components/PercentOnlyNote'
import PercentTierList from '@/form/components/PercentTierList'
import {
  buildFixedRows, buildFixedTiers, buildPercentRows, buildPercentTiers, isFixedRowComplete, isPercentRowComplete, keepOtherRows,
  parseAnchorPrice, updateRow, type PreviewTier,
} from '@/form/tierRows'

export interface TiersInitial {
  mode: PricingMode
  percentTiers: { minQty: number; percentOff: number; anchorPrice?: number }[]
  fixedTiers: { minQty: number; fixedPrice: number }[]
}

// The "Tiers" card: the quantities and what each earns, as a percentage off or
// a fixed price each. The rows of the mode that is not chosen are kept (so
// switching back loses nothing) but are not in the form. Every change reports
// the mode and the complete tiers.
export default function TiersCard({ allowPriceBasedModes, basePrice, currencyCode, initial, onTiersChange }: {
  /** False when the products have different prices: only a percentage, and no anchor price. */
  allowPriceBasedModes: boolean
  /** The price the tiers are worked out from, or null while no product is chosen. */
  basePrice: number | null
  currencyCode: string
  initial: TiersInitial
  onTiersChange: (change: { mode: PricingMode; tiers: PreviewTier[] }) => void
}) {
  const makeKey = () => crypto.randomUUID()
  const [chosenMode, setChosenMode] = useState(initial.mode)
  const [percentRows, setPercentRows] = useState(() => withOneRow(buildPercentRows({ tiers: initial.percentTiers, makeKey }), { key: makeKey(), minQty: '', percentOff: '', anchorPrice: '' }))
  const [fixedRows, setFixedRows] = useState(() => withOneRow(buildFixedRows({ tiers: initial.fixedTiers, makeKey }), { key: makeKey(), minQty: '', fixedPrice: '' }))
  const mode = allowPriceBasedModes ? chosenMode : 'percent'

  useEffect(() => {
    const tiers = mode === 'percent'
      ? buildPercentTiers({ rows: percentRows, isAnchorAllowed: allowPriceBasedModes, tools: { isPercentRowComplete, parseAnchorPrice } })
      : buildFixedTiers({ rows: fixedRows, tools: { isFixedRowComplete } })
    onTiersChange({ mode, tiers })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report when the tiers change, not whenever the parent passes a new callback
  }, [mode, percentRows, fixedRows, allowPriceBasedModes])

  function addTier() {
    if (mode === 'percent') setPercentRows((rows) => [...rows, { key: makeKey(), minQty: '', percentOff: '', anchorPrice: '' }])
    else setFixedRows((rows) => [...rows, { key: makeKey(), minQty: '', fixedPrice: '' }])
  }

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-form-sm pb-1">
        <div>
          <h2 className="text-form-headline-sm text-form-on-surface">Tiers</h2>
          <p className="text-form-body-sm text-form-on-surface-variant">Set volume discounts based on the quantity of items purchased.</p>
        </div>
        <ModeToggle mode={mode} isFixedAllowed={allowPriceBasedModes} onChange={setChosenMode} />
      </div>
      <PercentOnlyNote isShown={!allowPriceBasedModes} />
      {mode === 'percent' ? (
        <PercentTierList rows={percentRows} basePrice={basePrice} currencyCode={currencyCode} isAnchorAllowed={allowPriceBasedModes} onChange={({ key, field, value }) => setPercentRows((rows) => updateRow({ rows, key, field, value }))} onRemove={(key) => setPercentRows((rows) => keepOtherRows({ rows, key }))} />
      ) : (
        <FixedTierList rows={fixedRows} basePrice={basePrice} currencyCode={currencyCode} onChange={({ key, field, value }) => setFixedRows((rows) => updateRow({ rows, key, field, value }))} onRemove={(key) => setFixedRows((rows) => keepOtherRows({ rows, key }))} />
      )}
      <AddTierButton onAdd={addTier} />
    </Card>
  )
}

function withOneRow<Row>(rows: Row[], emptyRow: Row): Row[] {
  return rows.length > 0 ? rows : [emptyRow]
}
