'use client'

import { useState } from 'react'
import { discountedPrice, validateRule } from '@/timeDiscounts/items'

export type DisplayRow = {
  productId: string
  variantId?: string
  title: string
  /** Link to the product in the Shopify admin. */
  adminUrl: string
  /** null when the product could not be looked up. */
  regularPrice: number | null
  pricingMode: 'percent' | 'fixed'
  amount: number
  /** Added in this session and not saved yet. */
  isNew?: boolean
}

type Rule = { pricingMode: 'percent' | 'fixed'; amount: number }

const money = (value: number) => `£${value.toFixed(2)}`

const iconButton =
  'rounded p-2 text-foreground/40 transition-colors duration-200 hover:text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50'

function PencilIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    </svg>
  )
}

function BinIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

function ProductLink({ row }: { row: DisplayRow }) {
  return (
    <a href={row.adminUrl} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded">
      {row.title}
    </a>
  )
}

/** One table row of a time-based discount; swaps its cells for an inline form while editing. */
export default function ItemRow({
  row, editing, busy, error, onEdit, onCancel, onSave, onDelete,
}: {
  row: DisplayRow
  editing: boolean
  busy: boolean
  /** Server-side reason the last save/delete failed. */
  error: string | null
  onEdit: () => void
  onCancel: () => void
  onSave: (rule: Rule) => void
  onDelete: () => void
}) {
  return (
    <>
      {editing ? (
        <EditCells row={row} busy={busy} onCancel={onCancel} onSave={onSave} />
      ) : (
        <tr className="border-b border-line align-middle">
          <td className="py-3 pr-3"><ProductLink row={row} /></td>
          <td className="py-3 pr-3 text-sm">{row.pricingMode === 'fixed' ? 'Fixed price' : `${row.amount}% off`}</td>
          <td className="py-3 pr-3 text-sm font-medium whitespace-nowrap">
            {row.regularPrice == null ? '—' : money(discountedPrice(row, row.regularPrice))}
          </td>
          <td className="py-3 pr-3 text-sm text-muted whitespace-nowrap">{row.regularPrice == null ? '—' : money(row.regularPrice)}</td>
          <td className="py-3 text-right">
            <button type="button" onClick={onEdit} disabled={busy} aria-label={`Edit ${row.title}`} className={iconButton}><PencilIcon /></button>
          </td>
          <td className="py-3 text-right">
            <button type="button" onClick={onDelete} disabled={busy} aria-label={`Delete ${row.title}`} className={iconButton}><BinIcon /></button>
          </td>
        </tr>
      )}
      {error && (
        <tr>
          <td colSpan={6} role="alert" className="pb-3 text-xs text-danger">{error}</td>
        </tr>
      )}
    </>
  )
}

function EditCells({
  row, busy, onCancel, onSave,
}: {
  row: DisplayRow
  busy: boolean
  onCancel: () => void
  onSave: (rule: Rule) => void
}) {
  const [pricingMode, setPricingMode] = useState<'percent' | 'fixed'>(row.pricingMode)
  const [amountText, setAmountText] = useState(row.isNew ? '' : String(row.amount))

  const amount = Math.round(Number(amountText) * 100) / 100
  const rule: Rule = { pricingMode, amount }
  const message = validateRule(rule, row.regularPrice)
  const valid = amountText.trim() !== '' && message == null
  const label = pricingMode === 'percent' ? 'Percent off' : 'Fixed price'

  return (
    <tr className="border-b border-line align-top">
      <td className="py-3 pr-3"><ProductLink row={row} /></td>
      <td colSpan={2} className="py-3 pr-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={`Discount type for ${row.title}`}
            value={pricingMode}
            onChange={(e) => setPricingMode(e.target.value === 'fixed' ? 'fixed' : 'percent')}
            className="border border-line rounded px-2 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <option value="percent">Percentage off</option>
            <option value="fixed">Fixed price</option>
          </select>
          <input
            type="number" min="0.01" max={pricingMode === 'percent' ? 100 : undefined} step="0.01"
            aria-label={`${label} for ${row.title}`}
            placeholder={pricingMode === 'percent' ? '% off (e.g. 20)' : 'Price each (e.g. 1.50)'}
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            className="w-32 border border-line rounded px-2 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          {valid && row.regularPrice != null && (
            <span className="text-sm text-muted">→ {money(discountedPrice(rule, row.regularPrice))}</span>
          )}
        </div>
        {amountText.trim() !== '' && message && <p role="alert" className="mt-1 text-xs text-danger">{message}</p>}
      </td>
      <td className="py-3 pr-3 text-sm text-muted whitespace-nowrap">{row.regularPrice == null ? '—' : money(row.regularPrice)}</td>
      <td colSpan={2} className="py-3 text-right whitespace-nowrap">
        <button
          type="button" disabled={!valid || busy} onClick={() => onSave(rule)}
          className="bg-accent hover:bg-accent-hover text-white px-3 py-2 rounded text-sm mr-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button" disabled={busy} onClick={onCancel}
          className="bg-surface border border-line hover:bg-line px-3 py-2 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
        >
          Cancel
        </button>
      </td>
    </tr>
  )
}
