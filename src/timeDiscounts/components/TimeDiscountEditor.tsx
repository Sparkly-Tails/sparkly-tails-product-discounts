'use client'

import { useEffect, useRef, useState } from 'react'
import ConfirmForm from '@/components/ConfirmForm'
import { useSavedToast } from '@/components/SavedToast'
import {
  saveTimeDiscountTitle, saveTimeDiscountSchedule, saveTimeDiscountItem, removeTimeDiscountItem,
} from '@/timeDiscounts/actions'
import { itemKey, productAdminUrl } from '@/timeDiscounts/items'
import AddItemPicker, { type PickedItem } from '@/timeDiscounts/components/AddItemPicker'
import ItemRow, { type DisplayRow } from '@/timeDiscounts/components/ItemRow'
import { useSaveQueue } from '@/timeDiscounts/components/useSaveQueue'

/** How long after the last change to either date the schedule is saved. */
export const SCHEDULE_SAVE_DELAY_MS = 600

function without(record: Record<string, string>, key: string): Record<string, string> {
  const next = { ...record }
  delete next[key]
  return next
}

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
  const savedTitle = useRef(initialTitle)

  const [startsAt, setStartsAt] = useState(initialStartsAt)
  const [endsAt, setEndsAt] = useState(initialEndsAt)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const savedSchedule = useRef({ startsAt: initialStartsAt, endsAt: initialEndsAt })
  const scheduleInvalid = startsAt !== '' && endsAt !== '' && endsAt <= startsAt ? 'End must be after start.' : null

  const [rows, setRows] = useState<DisplayRow[]>(initialRows)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})

  function saveTitle() {
    const next = title.trim()
    if (!next) {
      setTitleError('A title is required')
      return
    }
    if (next === savedTitle.current) return
    setTitleError(null)
    enqueue(() => saveTimeDiscountTitle(discountId, next)).then((result) => {
      if (result.ok) {
        savedTitle.current = next
        setTitle(next)
        showSaved()
      } else {
        setTitleError(result.error)
      }
    })
  }

  // The schedule saves itself once both dates are valid and have settled.
  useEffect(() => {
    if (!startsAt || !endsAt || endsAt <= startsAt) return
    if (startsAt === savedSchedule.current.startsAt && endsAt === savedSchedule.current.endsAt) return

    const timer = setTimeout(() => {
      enqueue(() => saveTimeDiscountSchedule(discountId, startsAt, endsAt)).then((result) => {
        if (result.ok) {
          savedSchedule.current = { startsAt, endsAt }
          setScheduleError(null)
          showSaved()
        } else {
          setScheduleError(result.error)
        }
      })
    }, SCHEDULE_SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [startsAt, endsAt, discountId, enqueue, showSaved])

  function withoutUnsavedRows(list: DisplayRow[], keep?: string) {
    return list.filter((row) => !row.isNew || itemKey(row) === keep)
  }

  function startEdit(row: DisplayRow) {
    setRows((current) => withoutUnsavedRows(current, itemKey(row)))
    setEditingKey(itemKey(row))
  }

  function cancelEdit(row: DisplayRow) {
    setRows((current) => withoutUnsavedRows(current))
    setRowErrors((errors) => without(errors, itemKey(row)))
    setEditingKey(null)
  }

  function saveRow(row: DisplayRow, rule: { pricingMode: 'percent' | 'fixed'; amount: number }) {
    const key = itemKey(row)
    setBusyKey(key)
    setRowErrors((errors) => without(errors, key))
    enqueue(() => saveTimeDiscountItem(discountId, { productId: row.productId, variantId: row.variantId, ...rule })).then((result) => {
      setBusyKey(null)
      if (result.ok) {
        setRows((current) => current.map((r) => (itemKey(r) === key ? { ...r, ...rule, isNew: false } : r)))
        setEditingKey(null)
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
    setBusyKey(key)
    setRowErrors((errors) => without(errors, key))
    enqueue(() => removeTimeDiscountItem(discountId, { productId: row.productId, variantId: row.variantId })).then((result) => {
      setBusyKey(null)
      if (result.ok) {
        setRows((current) => current.filter((r) => itemKey(r) !== key))
        showSaved()
      } else {
        setRowErrors((errors) => ({ ...errors, [key]: result.error }))
      }
    })
  }

  function addRow(item: PickedItem) {
    const row: DisplayRow = {
      productId: item.productId,
      variantId: item.variantId,
      title: item.title,
      adminUrl: productAdminUrl(adminProductBaseUrl, item.productId),
      regularPrice: item.price,
      pricingMode: 'percent',
      amount: 0,
      isNew: true,
    }
    setRows((current) => [...withoutUnsavedRows(current), row])
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
        {rows.length === 0 ? (
          <p className="text-sm text-muted mb-3">No products yet — add one below.</p>
        ) : (
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
                    busy={busyKey === key}
                    error={rowErrors[key] ?? null}
                    onEdit={() => startEdit(row)}
                    onCancel={() => cancelEdit(row)}
                    onSave={(rule) => saveRow(row, rule)}
                    onDelete={() => deleteRow(row)}
                  />
                )
              })}
            </tbody>
          </table>
        )}
        <AddItemPicker excludeDiscountId={discountId} existingKeys={rows.map(itemKey)} onSelect={addRow} />
      </section>

      <section className="flex gap-3">
        <ConfirmForm action={deleteAction} confirmMessage="Delete this discount entirely? This cannot be undone.">
          <button type="submit" className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger">
            Delete
          </button>
        </ConfirmForm>
      </section>
    </div>
  )
}
