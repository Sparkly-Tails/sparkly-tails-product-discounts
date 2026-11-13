// Which other Shopify discounts may apply next to the tier discounts. The answer lives on the Shopify discount
// records themselves (the shared "Product tier discounts" record and one record per flash sale), so Shopify
// stays the source of truth and nothing is copied into the store's settings.
import { listTierRecords, SHARED_RECORD_TOOLS, updateCombining, findSharedRecord, type CombineFlags, type RecordNode } from '@/flash/sharedRecord'
import type { ShopifyQuery } from '@/flash/shopifyRecord'

export type StackingFlags = CombineFlags

export const DEFAULT_STACKING: StackingFlags = { orderDiscounts: false, shippingDiscounts: false, productDiscounts: false }

/** The combining input for a record. While a flash sale exists, product discounts stay on: flash sales need them. */
export function buildCombinesWith({ orderDiscounts, shippingDiscounts, productDiscounts, hasFlash }: StackingFlags & { hasFlash: boolean }): StackingFlags {
  return { orderDiscounts, shippingDiscounts, productDiscounts: productDiscounts || hasFlash }
}

/** True when any discount runs as a flash sale (it then needs product discounts to combine). */
export function hasFlashSale({ discounts }: { discounts: { flash?: unknown }[] }): boolean {
  return discounts.some((discount) => discount.flash !== undefined)
}

/** The three choices of a record as plain values (a record that is not there reads as Shopify's default, all off). */
export function pickStackingFlags({ record }: { record: RecordNode }): StackingFlags {
  return { orderDiscounts: record.orderDiscounts, shippingDiscounts: record.shippingDiscounts, productDiscounts: record.productDiscounts }
}

/** Ids of every record that runs the tier Function: the shared one and the flash ones. No Function id (the app is not installed here) means no record. */
export function pickTierRecordIds({ nodes, functionId }: { nodes: RecordNode[]; functionId: string }): string[] {
  const ids: string[] = []
  for (const node of nodes.filter((found) => found.functionId !== '')) if (node.functionId === functionId) ids.push(node.id)
  return ids
}

/** The messages of the updates that failed, in order. */
export function listFailureMessages({ results }: { results: PromiseSettledResult<void>[] }): string[] {
  return results.flatMap((result) => (result.status === 'rejected' ? [result.reason instanceof Error ? result.reason.message : 'Shopify refused the update'] : []))
}

/** Sends the same choices to every record at once; each update settles on its own, so one refusal does not stop the others. */
export function updateRecords({ recordIds, combinesWith, query, updateRecord }: {
  recordIds: string[]
  combinesWith: StackingFlags
  query: ShopifyQuery
  updateRecord: typeof updateCombining
}): Promise<PromiseSettledResult<void>[]> {
  const updates: Promise<void>[] = []
  for (const recordId of recordIds) updates.push(updateRecord({ query, recordId, combinesWith }))
  return Promise.allSettled(updates)
}

export const STACKING_TOOLS = {
  listRecords: listTierRecords,
  listTools: SHARED_RECORD_TOOLS,
  findShared: findSharedRecord,
  pickFlags: pickStackingFlags,
  pickIds: pickTierRecordIds,
  buildCombines: buildCombinesWith,
  updateRecord: updateCombining,
  updateAll: updateRecords,
  listFailures: listFailureMessages,
}

/** What the shared tier record allows today; all off when the store has no shared record yet. */
export async function readSharedStacking({ query, tools = STACKING_TOOLS }: { query: ShopifyQuery; tools?: typeof STACKING_TOOLS }): Promise<StackingFlags> {
  const { nodes, functionId } = await tools.listRecords({ query, tools: tools.listTools })
  return tools.pickFlags({ record: tools.findShared({ nodes, functionId }) })
}

/**
 * Sets the choices on the shared record and on every flash record, each with its own update. Every record is
 * tried even if one is refused; the refusals come back together as one error.
 */
export async function writeStacking({ flags, hasFlash, query, tools = STACKING_TOOLS }: { flags: StackingFlags; hasFlash: boolean; query: ShopifyQuery; tools?: typeof STACKING_TOOLS }): Promise<void> {
  const { nodes, functionId } = await tools.listRecords({ query, tools: tools.listTools })
  const combinesWith = tools.buildCombines({ ...flags, hasFlash })
  const results = await tools.updateAll({ recordIds: tools.pickIds({ nodes, functionId }), combinesWith, query, updateRecord: tools.updateRecord })
  const failures = tools.listFailures({ results })
  if (failures.length > 0) throw new Error(failures.join('; '))
}
