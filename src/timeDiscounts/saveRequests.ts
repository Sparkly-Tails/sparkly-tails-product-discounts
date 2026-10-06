import {
  saveTimeDiscountTitle, saveTimeDiscountSchedule, saveTimeDiscountItem, removeTimeDiscountItem, type SaveResult,
} from '@/timeDiscounts/actions'
import { saveGroupRule, saveGroupSelection } from '@/timeDiscounts/groupActions'
import type { GroupSaveResult } from '@/timeDiscounts/group'
import type { GroupSelection } from '@/timeDiscounts/config'
import type { Rule } from '@/timeDiscounts/rows'

/** Runs one save at a time, in order (see useSaveQueue). */
export type Enqueue = <T>(task: () => Promise<T>) => Promise<T>

type ProductKey = { productId: string; variantId?: string }

/** What a save resolves to when the call itself is rejected (network drop, or a stale action after a deploy). */
export const UNREACHABLE: Extract<SaveResult, { ok: false }> = { ok: false, error: "Couldn't reach the server — reload the page and try again" }

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

export function requestGroupRuleSave(enqueue: Enqueue, discountId: string, rule: Rule): Promise<GroupSaveResult> {
  return enqueue(() => saveGroupRule(discountId, rule)).catch(unreachable)
}

export function requestGroupSelectionSave(enqueue: Enqueue, discountId: string, selection: GroupSelection): Promise<GroupSaveResult> {
  return enqueue(() => saveGroupSelection(discountId, selection)).catch(unreachable)
}
