'use client'

import { useEffect, useRef, useState } from 'react'
import ConfirmForm from '@/components/ConfirmForm'
import { useSavedToast } from '@/components/SavedToast'
import { itemKey, scheduleProblem } from '@/timeDiscounts/items'
import {
  addDraftRow, dropUnsavedRows, keepRow, newDraftRow, omitKey, removeRow, settledTitle, shouldSaveSchedule, titleSaveDecision, type Rule,
} from '@/timeDiscounts/rows'
import { requestRowRemoval, requestRowSave, requestScheduleSave, requestTitleSave } from '@/timeDiscounts/saveRequests'
import AddItemPicker, { type PickedItem } from '@/timeDiscounts/components/AddItemPicker'
import type { DisplayRow } from '@/timeDiscounts/components/ItemRow'
import ItemsTable from '@/timeDiscounts/components/ItemsTable'
import { useSaveQueue } from '@/timeDiscounts/components/useSaveQueue'

/** How long after the last change to either date the schedule is saved. */
export const SCHEDULE_SAVE_DELAY_MS = 600

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

  const [title, setTitle] = useState(initialTitle)
  const [titleError, setTitleError] = useState<string | null>(null)
  const savedTitle = useRef(initialTitle) // last value the server acknowledged
  const requestedTitle = useRef(initialTitle) // last value a save was queued for

  const [startsAt, setStartsAt] = useState(initialStartsAt)
  const [endsAt, setEndsAt] = useState(initialEndsAt)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const savedSchedule = useRef({ startsAt: initialStartsAt, endsAt: initialEndsAt }) // last acknowledged
  const requestedSchedule = useRef({ startsAt: initialStartsAt, endsAt: initialEndsAt }) // last queued
  const scheduleInvalid = scheduleProblem(startsAt, endsAt)

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

  function saveTitle() {
    const decision = titleSaveDecision(title, requestedTitle.current)
    if (decision.action === 'error') {
      setTitleError(decision.message)
      return
    }
    if (decision.action === 'skip') return
    const next = decision.title
    requestedTitle.current = next
    setTitleError(null)
    requestTitleSave(enqueue, discountId, next).then((result) => {
      if (result.ok) {
        savedTitle.current = next
        if (requestedTitle.current === next) setTitleError(null) // a stale error must not sit beside a live title
        // Tidy the saved value, but never overwrite what was typed since the blur.
        setTitle((current) => settledTitle(current, next))
        showSaved()
      } else {
        // Let the same value be retried, unless a newer one has been queued since.
        if (requestedTitle.current === next) requestedTitle.current = savedTitle.current
        setTitleError(result.error)
      }
    })
  }

  // The schedule saves itself once both dates are valid and have settled.
  useEffect(() => {
    if (!shouldSaveSchedule(startsAt, endsAt, requestedSchedule.current)) return

    const timer = setTimeout(() => {
      const requested = { startsAt, endsAt }
      requestedSchedule.current = requested
      requestScheduleSave(enqueue, discountId, startsAt, endsAt).then((result) => {
        if (result.ok) {
          savedSchedule.current = requested
          setScheduleError(null)
          showSaved()
        } else {
          // Let the same dates be retried, unless newer ones have been queued since.
          if (requestedSchedule.current === requested) requestedSchedule.current = savedSchedule.current
          setScheduleError(result.error)
        }
      })
    }, SCHEDULE_SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [startsAt, endsAt, discountId, enqueue, showSaved])

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
