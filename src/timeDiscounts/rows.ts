import { itemKey, productAdminUrl, scheduleProblem } from '@/timeDiscounts/items'
import type { DisplayRow } from '@/timeDiscounts/components/ItemRow'
import type { PickedItem } from '@/timeDiscounts/components/AddItemPicker'

// Pure helpers for the discount pages. Nothing here reads component state:
// every value a function needs is passed in, and every result is returned.

export type Rule = { pricingMode: 'percent' | 'fixed'; amount: number }

/**
 * Drops rows that were added but never kept — except the one being edited
 * (`keepKey`) and the one whose save is in flight (`busyKey`).
 */
export function dropUnsavedRows(rows: DisplayRow[], keepKey: string | null, busyKey: string | null): DisplayRow[] {
  return rows.filter((row) => !row.isNew || itemKey(row) === keepKey || itemKey(row) === busyKey)
}

/** A row for a product just picked: not kept yet, and opened as a percentage rule with no amount. */
export function newDraftRow(item: PickedItem, adminProductBaseUrl: string): DisplayRow {
  return {
    productId: item.productId,
    variantId: item.variantId,
    title: item.title,
    adminUrl: productAdminUrl(adminProductBaseUrl, item.productId),
    regularPrice: item.price,
    pricingMode: 'percent',
    amount: 0,
    isNew: true,
  }
}

/** The list with `row` added, after dropping other unsaved rows (but not the one whose save is in flight). */
export function addDraftRow(rows: DisplayRow[], row: DisplayRow, busyKey: string | null): DisplayRow[] {
  return [...dropUnsavedRows(rows, null, busyKey), row]
}

/** The list with the rule stored on the row `key`, which is now kept. */
export function keepRow(rows: DisplayRow[], key: string, rule: Rule): DisplayRow[] {
  return rows.map((row) => (itemKey(row) === key ? { ...row, ...rule, isNew: false } : row))
}

export function removeRow(rows: DisplayRow[], key: string): DisplayRow[] {
  return rows.filter((row) => itemKey(row) !== key)
}

/** A copy of `record` without `key`. */
export function omitKey(record: Record<string, string>, key: string): Record<string, string> {
  const next = { ...record }
  delete next[key]
  return next
}

export type TitleDecision = { action: 'error'; message: string } | { action: 'skip' } | { action: 'save'; title: string }

/** What a title edit should do, given the last title a save was queued for. */
export function titleSaveDecision(rawTitle: string, requestedTitle: string): TitleDecision {
  const title = rawTitle.trim()
  if (!title) return { action: 'error', message: 'A title is required' }
  if (title === requestedTitle) return { action: 'skip' }
  return { action: 'save', title }
}

/** Whether a changed pair of dates should be saved: complete, valid, and not the pair already requested. */
export function shouldSaveSchedule(startsAt: string, endsAt: string, requested: { startsAt: string; endsAt: string }): boolean {
  if (!startsAt || !endsAt || scheduleProblem(startsAt, endsAt)) return false
  return !(startsAt === requested.startsAt && endsAt === requested.endsAt)
}

/** The title to show once `savedTitle` is saved: tidied, but never replacing what was typed since the blur. */
export function settledTitle(currentTitle: string, savedTitle: string): string {
  return currentTitle.trim() === savedTitle ? savedTitle : currentTitle
}

/** Rows that count towards the discount: those not still being added. */
export function keptRows(rows: DisplayRow[]): DisplayRow[] {
  return rows.filter((row) => !row.isNew)
}

/** The kept rows as the JSON the create form sends: product, optional variant, rule and amount. */
export function itemsPayload(rows: DisplayRow[]): string {
  return JSON.stringify(
    keptRows(rows).map((row) => ({
      productId: row.productId,
      ...(row.variantId ? { variantId: row.variantId } : {}),
      pricingMode: row.pricingMode,
      amount: row.amount,
    })),
  )
}

/** Why the new-discount form cannot be saved yet, most basic reason first; null when it can. */
export function saveBlocker(form: {
  title: string
  startsAt: string
  endsAt: string
  scheduleProblem: string | null
  editingKey: string | null
  keptCount: number
}): string | null {
  if (form.title.trim() === '') return 'Add a title to save.'
  if (form.startsAt === '' || form.endsAt === '') return 'Set a start and an end time to save.'
  if (form.scheduleProblem) return 'Fix the schedule to save.'
  if (form.editingKey !== null) return "Save or cancel the row you're editing."
  if (form.keptCount === 0) return 'Add at least one product to save.'
  return null
}

/** True once anything has been entered that closing the page would lose. */
export function hasUnsavedWork(form: { title: string; startsAt: string; endsAt: string; rowCount: number }): boolean {
  return form.title !== '' || form.startsAt !== '' || form.endsAt !== '' || form.rowCount > 0
}

/** A redirect after a successful create reaches the caller as a thrown error; it must go on to navigate, not be shown as a failure. */
export function isRedirectError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && String((err as { digest?: unknown }).digest ?? '').startsWith('NEXT_REDIRECT')
}
