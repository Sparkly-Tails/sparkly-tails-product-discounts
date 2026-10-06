import {
  saveTimeDiscountTitle, saveTimeDiscountSchedule, saveTimeDiscountItem, removeTimeDiscountItem, type SaveResult,
} from '@/timeDiscounts/actions'
import type { Rule } from '@/timeDiscounts/rows'

/** Runs one save at a time, in order (see useSaveQueue). */
export type Enqueue = <T>(task: () => Promise<T>) => Promise<T>

type ProductKey = { productId: string; variantId?: string }

/** What a save resolves to when the call itself is rejected (network drop, or a stale action after a deploy). */
export const UNREACHABLE: SaveResult = { ok: false, error: "Couldn't reach the server — reload the page and try again" }

const unreachable = () => UNREACHABLE

// Each request is queued and never rejects: a failure of the call itself comes back as UNREACHABLE.

export function requestTitleSave(enqueue: Enqueue, discountId: string, title: string): Promise<SaveResult> {
  return enqueue(() => saveTimeDiscountTitle(discountId, title)).catch(unreachable)
}

export function requestScheduleSave(enqueue: Enqueue, discountId: string, startsAt: string, endsAt: string): Promise<SaveResult> {
  return enqueue(() => saveTimeDiscountSchedule(discountId, startsAt, endsAt)).catch(unreachable)
}

export function requestRowSave(enqueue: Enqueue, discountId: string, row: ProductKey, rule: Rule): Promise<SaveResult> {
  return enqueue(() => saveTimeDiscountItem(discountId, { productId: row.productId, variantId: row.variantId, ...rule })).catch(unreachable)
}

export function requestRowRemoval(enqueue: Enqueue, discountId: string, row: ProductKey): Promise<SaveResult> {
  return enqueue(() => removeTimeDiscountItem(discountId, { productId: row.productId, variantId: row.variantId })).catch(unreachable)
}
