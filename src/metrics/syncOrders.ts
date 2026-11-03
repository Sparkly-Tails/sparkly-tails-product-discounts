// Reads the orders of a shop through the Admin API into the bundle rows: the first read goes back 90 days, later reads go
// on from the marker. It runs on a homepage load, so one call reads at most 10 pages and the marker says where to go on.
// Every outside step is handed in through `tools`; saving the same order again changes nothing.
import type { OrdersPage } from '@/metrics/queryOrders'
import type { SyncMarker } from '@/metrics/store'
import { mapEach } from '@/metrics/readOrder'
import type { BundleOrderRow, OrderFacts } from '@/metrics/types'

const HOUR_MS = 3600 * 1000
const BACKFILL_DAYS = 90
const MAX_PAGES = 10
/** The messages Shopify gives for a missing scope or a missing protected customer data approval. */
const DENIED_PATTERN = /access denied|not approved to access|\(HTTP 403\)/i

export type SyncResult = 'synced' | 'up-to-date' | 'needs-permission'

interface PageRead {
  rows: BundleOrderRow[]
  orderedAt: string | null
}

interface ReadResult {
  lastOrderAt: string | null
  finished: boolean
}

export function computeEarlierTime({ iso, ms }: { iso: string; ms: number }): string {
  return new Date(new Date(iso).getTime() - ms).toISOString()
}

/** True when the last sync was less than an hour ago. */
export function isMarkerFresh({ lastOrderSyncAt, nowIso }: { lastOrderSyncAt: string | null; nowIso: string }): boolean {
  return lastOrderSyncAt !== null && new Date(nowIso).getTime() - new Date(lastOrderSyncAt).getTime() < HOUR_MS
}

/** Where to read from: an hour before the marker (orders can arrive late), or 90 days back when nothing was read yet. */
export function pickSince({ lastOrderSyncAt, nowIso, tools }: { lastOrderSyncAt: string | null; nowIso: string; tools: Pick<SyncTools, 'computeEarlierTime'> }): string {
  return lastOrderSyncAt ? tools.computeEarlierTime({ iso: lastOrderSyncAt, ms: HOUR_MS }) : tools.computeEarlierTime({ iso: nowIso, ms: BACKFILL_DAYS * 24 * HOUR_MS })
}

export function isAccessDenied({ error }: { error: unknown }): boolean {
  return DENIED_PATTERN.test(error instanceof Error ? error.message : '')
}

/** The rows of one order node, and when the order was placed; nothing for a node that cannot be read. */
export function readNodeRows({ item: node, context }: { item: unknown; context: { productDiscounts: Record<string, string>; tools: SyncTools } }): PageRead {
  const order = context.tools.readOrder({ node })
  return order ? { rows: context.tools.listRows({ order, productDiscounts: context.productDiscounts }), orderedAt: order.orderedAt } : { rows: [], orderedAt: null }
}

function pickRows(read: PageRead): BundleOrderRow[] {
  return read.rows
}

function pickOrderedAt(read: PageRead): string | null {
  return read.orderedAt
}

function hasText(value: string | null): value is string {
  return value !== null
}

/** Saves the rows of one page; gives the time of the last order read (the page is oldest first), or the time before when the page had none. */
export async function savePage({ shop, nodes, productDiscounts, previous, tools }: { shop: string; nodes: unknown[]; productDiscounts: Record<string, string>; previous: string | null; tools: SyncTools }): Promise<string | null> {
  const reads = tools.mapEach({ items: nodes, run: tools.readNodeRows, context: { productDiscounts, tools } })
  const rows = reads.flatMap(pickRows)
  if (rows.length > 0) await tools.saveRows({ shop, rows })
  return reads.map(pickOrderedAt).filter(hasText).at(-1) ?? previous
}

/** Reads pages until there are no more, or 10 are read. */
export async function readPages({ shop, sinceIso, productDiscounts, tools }: { shop: string; sinceIso: string; productDiscounts: Record<string, string>; tools: SyncTools }): Promise<ReadResult> {
  let cursor: string | null = null
  let lastOrderAt: string | null = null
  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
    const page: OrdersPage = await tools.queryOrders({ shop, sinceIso, afterCursor: cursor })
    lastOrderAt = await tools.savePage({ shop, nodes: page.nodes, productDiscounts, previous: lastOrderAt, tools })
    if (!page.hasNextPage) return { lastOrderAt, finished: true }
    cursor = page.endCursor
  }
  return { lastOrderAt, finished: false }
}

/** The time a read that stopped has seen up to: its last order, else the marker, else now. */
export function pickUnfinishedTime({ lastOrderAt, markerTime, nowIso }: { lastOrderAt: string | null; markerTime: string | null; nowIso: string }): string {
  return lastOrderAt ?? markerTime ?? nowIso
}

/** A finished read has seen everything up to now; a read that stopped has seen up to its last order. */
export function pickSyncTime({ result, marker, nowIso, tools }: { result: ReadResult; marker: SyncMarker; nowIso: string; tools: Pick<SyncTools, 'pickUnfinishedTime'> }): string {
  return result.finished ? nowIso : tools.pickUnfinishedTime({ lastOrderAt: result.lastOrderAt, markerTime: marker.lastOrderSyncAt, nowIso })
}

export function pickBackfillStart({ marker, sinceIso }: { marker: SyncMarker; sinceIso: string }): string {
  return marker.backfilledUntil ?? sinceIso
}

/** Reads the orders and records how far they were read. */
export async function readAndMark({ shop, marker, nowIso, tools }: { shop: string; marker: SyncMarker; nowIso: string; tools: SyncTools }): Promise<void> {
  const sinceIso = tools.pickSince({ lastOrderSyncAt: marker.lastOrderSyncAt, nowIso, tools })
  const result = await tools.readPages({ shop, sinceIso, productDiscounts: await tools.readLiveProducts({ shop }), tools })
  await tools.writeMarker({ shop, lastOrderSyncAt: tools.pickSyncTime({ result, marker, nowIso, tools }), backfilledUntil: tools.pickBackfillStart({ marker, sinceIso }) })
}

export async function runSync({ shop, marker, nowIso, tools }: { shop: string; marker: SyncMarker; nowIso: string; tools: SyncTools }): Promise<SyncResult> {
  try {
    await tools.readAndMark({ shop, marker, nowIso, tools })
    return 'synced'
  } catch (error) {
    if (tools.isAccessDenied({ error })) return 'needs-permission'
    throw error
  }
}

export interface SyncTools {
  readMarker: (args: { shop: string }) => Promise<SyncMarker>
  writeMarker: (args: { shop: string; lastOrderSyncAt: string; backfilledUntil: string }) => Promise<void>
  queryOrders: (args: { shop: string; sinceIso: string; afterCursor: string | null }) => Promise<OrdersPage>
  readLiveProducts: (args: { shop: string }) => Promise<Record<string, string>>
  saveRows: (args: { shop: string; rows: BundleOrderRow[] }) => Promise<void>
  readOrder: (args: { node: unknown }) => OrderFacts | null
  listRows: (args: { order: OrderFacts; productDiscounts: Record<string, string> }) => BundleOrderRow[]
  mapEach: <Item, Result, Context>(args: { items: Item[]; run: (args: { item: Item; context: Context }) => Result; context: Context }) => Result[]
  computeEarlierTime: typeof computeEarlierTime
  isMarkerFresh: typeof isMarkerFresh
  pickSince: typeof pickSince
  isAccessDenied: typeof isAccessDenied
  readNodeRows: typeof readNodeRows
  savePage: typeof savePage
  readPages: typeof readPages
  pickUnfinishedTime: typeof pickUnfinishedTime
  pickSyncTime: typeof pickSyncTime
  pickBackfillStart: typeof pickBackfillStart
  readAndMark: typeof readAndMark
  runSync: typeof runSync
}

/** What the sync needs besides the database and Shopify steps (readMarker, writeMarker, queryOrders, readLiveProducts, saveRows, readOrder, listRows). */
export const SYNC_TOOLS = { mapEach, computeEarlierTime, isMarkerFresh, pickSince, isAccessDenied, readNodeRows, savePage, readPages, pickUnfinishedTime, pickSyncTime, pickBackfillStart, readAndMark, runSync }

export async function syncOrders({ shop, nowIso, tools }: { shop: string; nowIso: string; tools: SyncTools }): Promise<SyncResult> {
  const marker = await tools.readMarker({ shop })
  if (tools.isMarkerFresh({ lastOrderSyncAt: marker.lastOrderSyncAt, nowIso })) return 'up-to-date'
  return tools.runSync({ shop, marker, nowIso, tools })
}
