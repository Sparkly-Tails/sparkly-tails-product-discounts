'use client'

import { useActionState, useEffect, useState } from 'react'
import { createTimeDiscount, type SaveResult } from '@/timeDiscounts/actions'
import { itemKey, scheduleProblem, shopLocalNow } from '@/timeDiscounts/items'
import {
  addDraftRow, dropUnsavedRows, hasUnsavedWork, isRedirectError, itemsPayload, keepRow, keptRows, newDraftRow, removeRow, saveBlocker, type Rule,
} from '@/timeDiscounts/rows'
import { UNREACHABLE } from '@/timeDiscounts/saveRequests'
import AddItemPicker, { type PickedItem } from '@/timeDiscounts/components/AddItemPicker'
import type { DisplayRow } from '@/timeDiscounts/components/ItemRow'
import ItemsTable from '@/timeDiscounts/components/ItemsTable'

const inputClass =
  'w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent'

async function submit(previous: SaveResult | null, formData: FormData): Promise<SaveResult> {
  try {
    return await createTimeDiscount(previous, formData)
  } catch (err) {
    if (isRedirectError(err)) throw err
    return UNREACHABLE
  }
}

/** How often the form re-checks the clock, so an end time that slips into the past turns Save off by itself. */
const CLOCK_CHECK_MS = 15_000

/** The current time on the shop's clock, kept fresh while the page is open. */
function useShopNow(timeZone: string): string {
  const [now, setNow] = useState(() => shopLocalNow(timeZone))
  useEffect(() => {
    const timer = setInterval(() => setNow(shopLocalNow(timeZone)), CLOCK_CHECK_MS)
    return () => clearInterval(timer)
  }, [timeZone])
  return now
}

/**
 * Title, schedule and products on one page. Nothing exists in Shopify until
 * Save is pressed on a complete form: the whole discount is created in one
 * request, so a long fill-in can't run past the end time of a half-built
 * discount that is already live.
 */
export default function NewTimeDiscountForm({
  shopTimezone, adminProductBaseUrl,
}: {
  shopTimezone: string
  /** Ends with `/admin/products/` — used to link added rows. */
  adminProductBaseUrl: string
}) {
  const [state, formAction, pending] = useActionState(submit, null)

  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [rows, setRows] = useState<DisplayRow[]>([])
  const [editingKey, setEditingKey] = useState<string | null>(null)

  const kept = keptRows(rows)
  const now = useShopNow(shopTimezone)
  const problem = scheduleProblem(startsAt, endsAt, now)
  const missing = saveBlocker({ title, startsAt, endsAt, scheduleProblem: problem, editingKey, keptCount: kept.length })

  // The draft lives only in this page, so closing or reloading it would lose it.
  const hasWork = hasUnsavedWork({ title, startsAt, endsAt, rowCount: rows.length })
  useEffect(() => {
    if (!hasWork || pending) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasWork, pending])

  function addRow(item: PickedItem) {
    const row = newDraftRow(item, adminProductBaseUrl)
    setRows((current) => addDraftRow(current, row, null))
    setEditingKey(itemKey(row))
  }

  function startEdit(row: DisplayRow) {
    setRows((current) => dropUnsavedRows(current, itemKey(row), null))
    setEditingKey(itemKey(row))
  }

  function cancelEdit() {
    setRows((current) => dropUnsavedRows(current, null, null))
    setEditingKey(null)
  }

  function keepRowWithRule(row: DisplayRow, rule: Rule) {
    const key = itemKey(row)
    setRows((current) => keepRow(current, key, rule))
    setEditingKey((current) => (current === key ? null : current))
  }

  function deleteRow(row: DisplayRow) {
    if (!window.confirm(`Remove ${row.title} from this discount?`)) return
    if (row.isNew) {
      cancelEdit()
      return
    }
    const key = itemKey(row)
    setRows((current) => removeRow(current, key))
    setEditingKey((current) => (current === key ? null : current))
  }

  const itemsJson = itemsPayload(rows)

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Add time-based discount</h1>

      <form
        action={formAction}
        // Enter in a text box (the title, the product search) must not save the whole discount.
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault()
        }}
      >
        <input type="hidden" name="items" value={itemsJson} />

        <section className="mb-8">
          <label htmlFor="title" className="block text-sm font-medium mb-2">Title</label>
          <input
            id="title" name="title" type="text" placeholder="e.g. Spring Flash Sale"
            value={title} onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
          <p className="text-xs text-muted mt-2">Shown to customers in the countdown widget.</p>
        </section>

        <section className="mb-8">
          <h2 className="font-medium mb-2">Schedule</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="startsAt" className="block text-sm font-medium mb-2">Starts ({shopTimezone})</label>
              <input id="startsAt" name="startsAt" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="endsAt" className="block text-sm font-medium mb-2">Ends ({shopTimezone})</label>
              <input id="endsAt" name="endsAt" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputClass} />
            </div>
          </div>
          {problem && <p role="alert" className="text-xs text-danger mt-2">{problem}</p>}
        </section>

        <section className="mb-8">
          <h2 className="font-medium mb-2">Products</h2>
          <ItemsTable
            rows={rows}
            editingKey={editingKey}
            busy={pending}
            rowErrors={{}}
            onEdit={startEdit}
            onCancel={cancelEdit}
            onSave={keepRowWithRule}
            onDelete={deleteRow}
          />
          <AddItemPicker existingKeys={rows.map(itemKey)} onSelect={addRow} />
        </section>

        <section>
          <button
            type="submit" disabled={missing !== null || pending}
            aria-describedby={missing ? 'save-hint' : undefined}
            className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-accent"
          >
            {pending ? 'Saving…' : 'Save discount'}
          </button>
          {missing && <p id="save-hint" className="text-xs text-muted mt-2">{missing}</p>}
          {state && !state.ok && <p role="alert" className="text-sm text-danger mt-3">{state.error}</p>}
        </section>
      </form>
    </main>
  )
}
