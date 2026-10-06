'use client'

import { itemKey } from '@/timeDiscounts/items'
import ItemRow, { type DisplayRow } from '@/timeDiscounts/components/ItemRow'

type Rule = { pricingMode: 'percent' | 'fixed'; amount: number }

/** The products table of a time-based discount; what each row does is up to the page that uses it. */
export default function ItemsTable({
  rows, editingKey, busy, rowErrors, onEdit, onCancel, onSave, onDelete,
}: {
  rows: DisplayRow[]
  editingKey: string | null
  /** True while a request is in flight; every row's buttons are disabled. */
  busy: boolean
  rowErrors: Record<string, string>
  onEdit: (row: DisplayRow) => void
  onCancel: (row: DisplayRow) => void
  onSave: (row: DisplayRow, rule: Rule) => void
  onDelete: (row: DisplayRow) => void
}) {
  if (rows.length === 0) return <p className="text-sm text-muted mb-3">No products yet — add one below.</p>

  return (
    <table className="w-full mb-3 text-left">
      <thead>
        <tr className="border-b border-line text-xs text-muted">
          <th scope="col" className="py-2 pr-3 font-medium">Product</th>
          <th scope="col" className="py-2 pr-3 font-medium">Discount type</th>
          <th scope="col" className="py-2 pr-3 font-medium whitespace-nowrap">Discounted price</th>
          <th scope="col" className="py-2 pr-3 font-medium whitespace-nowrap">Regular price</th>
          <th scope="col" className="py-2"><span className="sr-only">Edit</span></th>
          <th scope="col" className="py-2"><span className="sr-only">Delete</span></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const key = itemKey(row)
          return (
            <ItemRow
              key={key}
              row={row}
              editing={editingKey === key}
              busy={busy}
              error={rowErrors[key] ?? null}
              onEdit={() => onEdit(row)}
              onCancel={() => onCancel(row)}
              onSave={(rule) => onSave(row, rule)}
              onDelete={() => onDelete(row)}
            />
          )
        })}
      </tbody>
    </table>
  )
}
