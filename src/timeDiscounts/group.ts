import { discountedPrice, itemKey, productAdminUrl, validateRule } from '@/timeDiscounts/items'
import type { PickedItem } from '@/timeDiscounts/components/AddItemPicker'
import type { Rule } from '@/timeDiscounts/rows'
import type { DiscountMember, GroupCollection, GroupMember, GroupSelection, GroupSpec, TimeDiscountItem } from '@/timeDiscounts/config'

// Pure helpers for group discounts. Nothing here reads component or server
// state: every value a function needs is passed in, every result is returned.

/** Collections are resolved up to this many products (+1, to tell "too many" from "exactly the limit"); anything over this cannot fit one discount anyway. */
export const GROUP_RESOLVE_LIMIT = 200
/** How long the Group page waits after the amount stops changing before it saves. */
export const RULE_SAVE_DELAY_MS = 600

export const EMPTY_SELECTION_MESSAGE = 'This selection covers no products.'
export const NOT_A_GROUP_MESSAGE = 'This is not a group discount.'
export const GROUP_DISCOUNT_MESSAGE = 'This is a group discount: change its shared price or its picks instead.'
const UNREADABLE = 'The group could not be read — reload the page and try again'

export type CoveredRow = {
  productId: string
  variantId?: string
  title: string
  /** Link to the product in the Shopify admin. */
  adminUrl: string
  regularPrice: number
  discountedPrice: number
}
export type Failure = { title: string; message: string }
export type PriceInfo = { title: string; price: number }
export type PreviewResult = { ok: true; covered: CoveredRow[] } | { ok: false; error: string }
export type GroupSaveResult = { ok: true; covered: CoveredRow[] } | { ok: false; error: string }

/** One row per member, each carrying the shared rule; a product listed twice appears once. */
export function expandGroup(rule: Rule, members: DiscountMember[]): TimeDiscountItem[] {
  const seen = new Set<string>()
  const items: TimeDiscountItem[] = []
  for (const member of members) {
    const key = itemKey(member)
    if (seen.has(key)) continue
    seen.add(key)
    items.push({
      productId: member.productId,
      ...(member.variantId ? { variantId: member.variantId } : {}),
      pricingMode: rule.pricingMode,
      amount: rule.amount,
    })
  }
  return items
}

/** The first failing product by name, and how many others fail too; null when nothing failed. */
export function summariseFailures(failures: Failure[]): string | null {
  if (failures.length === 0) return null
  const [first, ...others] = failures
  const more = others.length === 0 ? '' : ` (and ${others.length} more ${others.length === 1 ? 'product' : 'products'} with a problem)`
  return `${first.title}: ${first.message}${more}`
}

export function groupSizeMessage(count: number, truncated: boolean): string {
  const covers = truncated ? `more than ${GROUP_RESOLVE_LIMIT}` : String(count)
  return `This selection covers ${covers} products. One discount fits about 63 variants or 107 whole products. Pick fewer, or split it into two discounts.`
}

/** The table rows for `items`; a row whose price is unknown is left out. */
export function coveredRows(items: TimeDiscountItem[], prices: Map<string, PriceInfo>, adminProductBaseUrl: string): CoveredRow[] {
  return items.flatMap((item) => {
    const found = prices.get(itemKey(item))
    if (!found) return []
    return [{
      productId: item.productId,
      ...(item.variantId ? { variantId: item.variantId } : {}),
      title: found.title,
      adminUrl: productAdminUrl(adminProductBaseUrl, item.productId),
      regularPrice: found.price,
      discountedPrice: discountedPrice(item, found.price),
    }]
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A rule from untrusted input: mode defaults to percent, amount is rounded to pence. */
export function cleanRule(raw: unknown): Rule {
  if (!isRecord(raw)) throw new Error(UNREADABLE)
  const amount = Number(raw.amount)
  if (raw.amount === undefined || raw.amount === null || raw.amount === '' || !Number.isFinite(amount)) throw new Error(UNREADABLE)
  return { pricingMode: raw.pricingMode === 'fixed' ? 'fixed' : 'percent', amount: Math.round(amount * 100) / 100 }
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
}

/** A selection from untrusted input; anything that is not a well-formed pick is rejected rather than guessed at. */
export function cleanSelection(raw: unknown): GroupSelection {
  if (!isRecord(raw)) throw new Error(UNREADABLE)
  if (raw.mode === 'products') {
    if (!Array.isArray(raw.members)) throw new Error(UNREADABLE)
    const members: GroupMember[] = raw.members.map((entry: unknown) => {
      if (!isRecord(entry) || !nonEmptyString(entry.productId) || typeof entry.title !== 'string') throw new Error(UNREADABLE)
      if (entry.variantId != null && typeof entry.variantId !== 'string') throw new Error(UNREADABLE)
      return { productId: entry.productId, ...(entry.variantId ? { variantId: entry.variantId } : {}), title: entry.title }
    })
    return { mode: 'products', members }
  }
  if (raw.mode === 'collections') {
    if (!Array.isArray(raw.collections)) throw new Error(UNREADABLE)
    const collections: GroupCollection[] = raw.collections.map((entry: unknown) => {
      if (!isRecord(entry) || !nonEmptyString(entry.id) || typeof entry.title !== 'string') throw new Error(UNREADABLE)
      return { id: entry.id, title: entry.title }
    })
    return { mode: 'collections', collections }
  }
  throw new Error(UNREADABLE)
}

/** A whole group from the JSON the create form sends. */
export function parseGroupSpec(raw: string): GroupSpec {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(UNREADABLE)
  }
  if (!isRecord(parsed)) throw new Error(UNREADABLE)
  return { ...cleanRule(parsed), selection: cleanSelection(parsed.selection) }
}

/** The rule typed into the form: `rule` only when it is complete and valid; `problem` says why not (null while the amount is still empty). */
export function parseRuleInput(pricingMode: 'percent' | 'fixed', amountText: string): { rule: Rule | null; problem: string | null } {
  if (amountText.trim() === '') return { rule: null, problem: null }
  const rule: Rule = { pricingMode, amount: Math.round(Number(amountText) * 100) / 100 }
  const problem = validateRule(rule, null)
  return problem ? { rule: null, problem } : { rule, problem: null }
}

/** How long to wait before saving a rule change: none when the type changed, a pause while the amount is still being typed. */
export function ruleSaveDelay(lastRequested: Rule | null, pricingMode: 'percent' | 'fixed'): number {
  return lastRequested !== null && lastRequested.pricingMode !== pricingMode ? 0 : RULE_SAVE_DELAY_MS
}

export function selectionCount(selection: GroupSelection): number {
  return selection.mode === 'products' ? selection.members.length : selection.collections.length
}

export function isSelectionEmpty(selection: GroupSelection): boolean {
  return selectionCount(selection) === 0
}

/** Row keys of the picked products/variants (none in collections mode). */
export function memberKeys(selection: GroupSelection): string[] {
  return selection.mode === 'products' ? selection.members.map(itemKey) : []
}

export function addMember(selection: GroupSelection, item: PickedItem): GroupSelection {
  if (selection.mode !== 'products') return selection
  const member: GroupMember = { productId: item.productId, ...(item.variantId ? { variantId: item.variantId } : {}), title: item.title }
  return { mode: 'products', members: [...selection.members, member] }
}

export function removeMember(selection: GroupSelection, key: string): GroupSelection {
  if (selection.mode !== 'products') return selection
  const members = selection.members.filter((member) => itemKey(member) !== key)
  return members.length === selection.members.length ? selection : { mode: 'products', members }
}

/** An empty selection of `mode`; the same selection when it is already in that mode. */
export function switchMode(selection: GroupSelection, mode: 'products' | 'collections'): GroupSelection {
  if (selection.mode === mode) return selection
  return mode === 'products' ? { mode: 'products', members: [] } : { mode: 'collections', collections: [] }
}

/** Identifies one preview request: equal keys mean the same question. */
export function previewKey(rule: Rule, selection: GroupSelection): string {
  return JSON.stringify({ rule, selection })
}

export type GroupFormState = {
  title: string
  startsAt: string
  endsAt: string
  scheduleProblem: string | null
  amountText: string
  ruleProblem: string | null
  selectionEmpty: boolean
  preview: { status: 'idle' | 'loading' | 'ok' | 'error' }
}

/** Why the new group form cannot be saved yet, most basic reason first; null when it can. */
export function groupSaveBlocker(form: GroupFormState): string | null {
  if (form.title.trim() === '') return 'Add a title to save.'
  if (form.startsAt === '' || form.endsAt === '') return 'Set a start and an end time to save.'
  if (form.scheduleProblem) return 'Fix the schedule to save.'
  if (form.amountText.trim() === '') return 'Enter the shared price to save.'
  if (form.ruleProblem) return 'Fix the shared price to save.'
  if (form.selectionEmpty) return 'Pick at least one product, variant or collection to save.'
  if (form.preview.status === 'idle' || form.preview.status === 'loading') return 'Checking the products…'
  if (form.preview.status === 'error') return 'Fix the problem shown above to save.'
  return null
}

/** Search results minus the collections already picked. */
export function collectionsNotPicked(results: GroupCollection[], picked: GroupCollection[]): GroupCollection[] {
  return results.filter((result) => !picked.some((p) => p.id === result.id))
}

export function withCollection(picked: GroupCollection[], collection: GroupCollection): GroupCollection[] {
  return picked.some((p) => p.id === collection.id) ? picked : [...picked, collection]
}

export function withoutCollection(picked: GroupCollection[], id: string): GroupCollection[] {
  return picked.filter((p) => p.id !== id)
}

export function sameRule(a: Rule | null, b: Rule | null): boolean {
  if (a === null || b === null) return a === b
  return a.pricingMode === b.pricingMode && a.amount === b.amount
}

/** A refused rule and the reason, kept together so the reason is shown only beside that rule. */
export type RuleError = { rule: Rule; message: string }

/** What to show under the rule fields: a typed-in problem first, else the server's reason while the rule it refused is still the one typed. */
export function visibleRuleProblem(problem: string | null, rule: Rule | null, error: RuleError | null): string | null {
  if (problem) return problem
  return error !== null && rule !== null && sameRule(rule, error.rule) ? error.message : null
}
