'use client'

import { useActionState, useEffect, useReducer, useState } from 'react'
import { endTimeHasPassed, itemKey, scheduleProblem, shopLocalNow } from '@/timeDiscounts/items'
import {
  addDraftRow, dropUnsavedRows, hasUnsavedWork, itemsPayload, keepRow, keptRows, newDraftRow, removeRow, saveBlocker, type Rule,
} from '@/timeDiscounts/rows'
import { submitNewDiscount } from '@/timeDiscounts/newDiscountSubmit'
import AddItemPicker, { type PickedItem } from '@/timeDiscounts/components/AddItemPicker'
import type { DisplayRow } from '@/timeDiscounts/components/ItemRow'
import ItemsTable from '@/timeDiscounts/components/ItemsTable'
import TitleScheduleFields from '@/timeDiscounts/components/TitleScheduleFields'

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
  const [state, formAction, pending] = useActionState(submitNewDiscount, null)

  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [rows, setRows] = useState<DisplayRow[]>([])
  const [editingKey, setEditingKey] = useState<string | null>(null)

  const kept = keptRows(rows)
  // Read the clock each time Save's state is worked out, rather than from a timer that could be stale.
  const problem = scheduleProblem(startsAt, endsAt, shopLocalNow(shopTimezone, new Date()))
  // Bumped to work Save's state out again after a submit was stopped because the end time had passed.
  const [, recheck] = useReducer((count: number) => count + 1, 0)
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
        // The end time may have passed since Save last looked enabled: check the clock again right before submitting.
        onSubmit={(e) => {
          if (endTimeHasPassed(endsAt, shopTimezone, new Date())) {
            e.preventDefault()
            recheck()
          }
        }}
        // Enter in a text box (the title, the product search) must not save the whole discount.
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault()
        }}
      >
        <input type="hidden" name="items" value={itemsJson} />

        <TitleScheduleFields
          title={title} startsAt={startsAt} endsAt={endsAt} problem={problem} shopTimezone={shopTimezone}
          onTitleChange={setTitle} onStartsAtChange={setStartsAt} onEndsAtChange={setEndsAt}
        />

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
