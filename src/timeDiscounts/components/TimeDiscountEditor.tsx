'use client'

import { useRef, useState } from 'react'
import ConfirmForm from '@/components/ConfirmForm'
import { useSavedToast } from '@/components/SavedToast'
import { itemKey } from '@/timeDiscounts/items'
import {
  addDraftRow, dropUnsavedRows, keepRow, newDraftRow, omitKey, removeRow, type Rule,
} from '@/timeDiscounts/rows'
import { requestRowRemoval, requestRowSave } from '@/timeDiscounts/saveRequests'
import AddItemPicker, { type PickedItem } from '@/timeDiscounts/components/AddItemPicker'
import type { DisplayRow } from '@/timeDiscounts/components/ItemRow'
import ItemsTable from '@/timeDiscounts/components/ItemsTable'
import { useSaveQueue } from '@/timeDiscounts/components/useSaveQueue'
import { useTitleSchedule } from '@/timeDiscounts/components/useTitleSchedule'

export { SCHEDULE_SAVE_DELAY_MS } from '@/timeDiscounts/components/useTitleSchedule'

const inputClass =
  'w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent'

/**
 * The discount page: title, schedule and the products table. Every part saves
 * itself (no page-wide Save button) and shows the "Saved" pill on success;
 * failures are shown inline next to the part that failed. Saves are queued so
 * only one request is in flight at a time.
 */
export default function TimeDiscountEditor({
  discountId, shopTimezone, adminProductBaseUrl, initialTitle, initialStartsAt, initialEndsAt, initialRows, deleteAction,
}: {
  discountId: string
  shopTimezone: string
  /** Ends with `/admin/products/` — used to link newly added rows. */
  adminProductBaseUrl: string
  initialTitle: string
  initialStartsAt: string
  initialEndsAt: string
  initialRows: DisplayRow[]
  deleteAction: () => Promise<void>
}) {
  const { showSaved } = useSavedToast()
  const enqueue = useSaveQueue()
  const { title, setTitle, titleError, saveTitle, startsAt, setStartsAt, endsAt, setEndsAt, scheduleError, scheduleInvalid } =
    useTitleSchedule({ discountId, initialTitle, initialStartsAt, initialEndsAt, enqueue, showSaved })

  const [rows, setRows] = useState<DisplayRow[]>(initialRows)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  // Mirrors busyKey so handlers always see the row whose save is in flight, even from a stale closure.
  const busyKeyRef = useRef<string | null>(null)
  function markBusy(key: string | null) {
    busyKeyRef.current = key
    setBusyKey(key)
  }
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})

  // Deleting rewrites the same shop config the saves do, so it waits its turn in the queue.
  // The redirect thrown by the server action propagates through the queue's own promise.
  async function deleteQueued() {
    await enqueue(deleteAction)
  }

  function startEdit(row: DisplayRow) {
    setRows((current) => dropUnsavedRows(current, itemKey(row), busyKeyRef.current))
    setEditingKey(itemKey(row))
  }

  function cancelEdit(row: DisplayRow) {
    setRows((current) => dropUnsavedRows(current, null, busyKeyRef.current))
    setRowErrors((errors) => omitKey(errors, itemKey(row)))
    setEditingKey(null)
  }

  function saveRow(row: DisplayRow, rule: Rule) {
    const key = itemKey(row)
    markBusy(key)
    setRowErrors((errors) => omitKey(errors, key))
    requestRowSave(enqueue, discountId, row, rule).then((result) => {
      markBusy(null)
      if (result.ok) {
        setRows((current) => keepRow(current, key, rule))
        setEditingKey((current) => (current === key ? null : current))
        showSaved()
      } else {
        setRowErrors((errors) => ({ ...errors, [key]: result.error }))
      }
    })
  }

  function deleteRow(row: DisplayRow) {
    if (!window.confirm(`Remove ${row.title} from this discount?`)) return
    if (row.isNew) {
      cancelEdit(row)
      return
    }
    const key = itemKey(row)
    markBusy(key)
    setRowErrors((errors) => omitKey(errors, key))
    requestRowRemoval(enqueue, discountId, row).then((result) => {
      markBusy(null)
      if (result.ok) {
        setRows((current) => removeRow(current, key))
        showSaved()
      } else {
        setRowErrors((errors) => ({ ...errors, [key]: result.error }))
      }
    })
  }

  function addRow(item: PickedItem) {
    if (busyKeyRef.current !== null) return // a row save is in flight; its row must stay as it is
    const row = newDraftRow(item, adminProductBaseUrl)
    setRows((current) => addDraftRow(current, row, busyKeyRef.current))
    setEditingKey(itemKey(row))
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Time-based discount</h1>

      <section className="mb-8">
        <label htmlFor="title" className="block text-sm font-medium mb-2">Title</label>
        <input
          id="title" type="text" value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          className={inputClass}
        />
        <p className="text-xs text-muted mt-2">Shown to customers in the countdown widget.</p>
        {titleError && <p role="alert" className="text-xs text-danger mt-1">{titleError}</p>}
      </section>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Schedule</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="startsAt" className="block text-sm font-medium mb-2">Starts ({shopTimezone})</label>
            <input id="startsAt" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="endsAt" className="block text-sm font-medium mb-2">Ends ({shopTimezone})</label>
            <input id="endsAt" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputClass} />
          </div>
        </div>
        {(scheduleInvalid || scheduleError) && <p role="alert" className="text-xs text-danger mt-2">{scheduleInvalid ?? scheduleError}</p>}
      </section>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Products</h2>
        <ItemsTable
          rows={rows}
          editingKey={editingKey}
          busy={busyKey !== null}
          rowErrors={rowErrors}
          onEdit={startEdit}
          onCancel={cancelEdit}
          onSave={saveRow}
          onDelete={deleteRow}
        />
        <AddItemPicker excludeDiscountId={discountId} existingKeys={rows.map(itemKey)} onSelect={addRow} />
      </section>

      <section className="flex gap-3">
        <ConfirmForm action={deleteQueued} confirmMessage="Delete this discount entirely? This cannot be undone.">
          <button type="submit" className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger">
            Delete
          </button>
        </ConfirmForm>
      </section>
    </div>
  )
}
