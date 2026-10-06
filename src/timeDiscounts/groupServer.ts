import { resolveCollectionMembers } from '@/lib/collections'
import { getMemberInfo, getLowestVariantPrices } from '@/lib/products'
import { fetchAvailabilityConfigs, isAvailableEverywhere } from '@/lib/discount-availability'
import type { DiscountMember, GroupSpec, GroupSelection, TimeDiscount, TimeDiscountItem } from '@/timeDiscounts/config'
import { clearTimeDiscountMetafields, syncTimeDiscountMetafields } from '@/timeDiscounts/metafieldSync'
import { FUNCTION_CONFIG_MAX_BYTES, functionConfigBytes, itemKey, validateItemsStructure, validateRule } from '@/timeDiscounts/items'
import {
  EMPTY_SELECTION_MESSAGE, GROUP_RESOLVE_LIMIT, coveredRows, expandGroup, groupSizeMessage, isSelectionEmpty, summariseFailures,
  type CoveredRow, type Failure, type PriceInfo,
} from '@/timeDiscounts/group'

export interface ResolvedGroup {
  /** The rows to store and send to the checkout Function. */
  items: TimeDiscountItem[]
  /** What the discount covers, with prices, for the table. */
  covered: CoveredRow[]
}

/** The products/variants a selection stands for now. Collections are looked up (a snapshot), stopping once there are more than the limit. */
async function membersOf(selection: GroupSelection): Promise<DiscountMember[]> {
  if (selection.mode === 'products') {
    return selection.members.map(({ productId, variantId }) => ({ productId, ...(variantId ? { variantId } : {}) }))
  }
  if (selection.collections.length === 0) return []
  return resolveCollectionMembers(selection.collections.map((c) => c.id), GROUP_RESOLVE_LIMIT + 1)
}

/** Title and regular price per row key: variant rows from their own variant, whole-product rows from their CHEAPEST variant. */
async function regularPrices(items: TimeDiscountItem[]): Promise<Map<string, PriceInfo>> {
  const variantKeys = items.filter((i) => i.variantId).map((i) => ({ productId: i.productId, variantId: i.variantId }))
  const wholeProductIds = items.filter((i) => !i.variantId).map((i) => i.productId)
  const [variantInfo, lowest] = await Promise.all([getMemberInfo(variantKeys), getLowestVariantPrices(wholeProductIds)])

  const prices = new Map<string, PriceInfo>()
  for (const found of variantInfo) prices.set(itemKey(found), { title: found.title, price: found.price })
  for (const found of lowest) prices.set(itemKey({ productId: found.productId }), { title: found.title, price: found.price })
  return prices
}

/**
 * Everything the server needs to know about a group, in one place: what it
 * covers, whether every product can take the rule, and the rows to store.
 * Throws an Error whose message is what the merchant should read. Used by the
 * preview, by creating a group, and by every save on an existing one.
 * `excludeDiscountId` is the group's own id, so its current rows never count
 * as conflicts with themselves.
 */
export async function resolveGroup(
  group: GroupSpec,
  excludeDiscountId: string | undefined,
  adminProductBaseUrl: string,
  options: { allowEmpty?: boolean } = {},
): Promise<ResolvedGroup> {
  const ruleError = validateRule(group, null)
  if (ruleError) throw new Error(ruleError)

  // Only a selection with nothing picked may be empty (an existing group whose picks were all removed);
  // picks that resolve to no products (an empty collection) are always a failure.
  if (options.allowEmpty && isSelectionEmpty(group.selection)) return { items: [], covered: [] }

  const members = await membersOf(group.selection)
  if (members.length === 0) throw new Error(EMPTY_SELECTION_MESSAGE)
  // Collections are cut short at the limit + 1, so their count is not exact; explicit picks are.
  if (members.length > GROUP_RESOLVE_LIMIT) throw new Error(groupSizeMessage(members.length, group.selection.mode === 'collections'))

  const items = expandGroup(group, members)
  const structureError = validateItemsStructure(items)
  if (structureError) throw new Error(structureError)
  if (functionConfigBytes(items) > FUNCTION_CONFIG_MAX_BYTES) throw new Error(groupSizeMessage(items.length, false))

  const prices = await regularPrices(items)
  const { productConfig, timeConfig } = await fetchAvailabilityConfigs()

  const failures: Failure[] = []
  for (const item of items) {
    const found = prices.get(itemKey(item))
    const title = found?.title ?? `Product ${item.productId.split('/').pop()}`
    if (!found) {
      failures.push({ title, message: 'This product could not be found in Shopify' })
    } else if (!isAvailableEverywhere(productConfig, timeConfig, item.productId, item.variantId, excludeDiscountId)) {
      failures.push({ title, message: `This ${item.variantId ? 'variant' : 'product'} already belongs to another discount` })
    } else {
      const problem = validateRule(group, found.price)
      if (problem) failures.push({ title, message: problem })
    }
  }
  const message = summariseFailures(failures)
  if (message) throw new Error(message)

  return { items, covered: coveredRows(items, prices, adminProductBaseUrl) }
}

/** The table rows for rows that already exist (the discount page's first paint). A product that can no longer be found is left out. */
export async function loadCovered(items: TimeDiscountItem[], adminProductBaseUrl: string): Promise<CoveredRow[]> {
  return coveredRows(items, await regularPrices(items), adminProductBaseUrl)
}

/**
 * Brings the storefront in line with a group's new rows: a product that was
 * covered and no longer is loses its sale price, and the rest are written.
 * (Without the clearing, a product dropped from the group would keep showing
 * a sale price that checkout no longer gives.) Throws if either step failed.
 */
export async function syncGroupMetafields(before: TimeDiscountItem[], after: TimeDiscount, timezone: string): Promise<void> {
  const stillCovered = new Set(after.items.map((item) => item.productId))
  const dropped = [...new Set(before.map((item) => item.productId))]
    .filter((productId) => !stillCovered.has(productId))
    .map((productId) => ({ productId }))

  const results = await Promise.allSettled([
    dropped.length > 0 ? clearTimeDiscountMetafields(dropped) : Promise.resolve(),
    after.items.length > 0 ? syncTimeDiscountMetafields(after, timezone) : Promise.resolve(),
  ])
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  if (failed.length > 0) throw new Error(failed.map((r) => r.reason?.message ?? String(r.reason)).join('; '))
}
