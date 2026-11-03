// The only place the homepage metrics tables are read and written. Every function gets the database as a parameter
// (the Prisma client, or a fake with the same methods in a test).
import type { BundleOrderRow } from '@/metrics/types'

interface ShopDeleter {
  deleteMany: (args: { where: { shop: string } }) => Promise<unknown>
}

export interface MetricsDeleteDb {
  discountDailyStat: ShopDeleter
  visitorSeen: ShopDeleter
  bundleOrder: ShopDeleter
  metricsSync: ShopDeleter
}

/** Removes everything the metrics hold about one shop (used when Shopify asks for the shop's data to be erased). */
export async function deleteShopMetrics({ db, shop }: { db: MetricsDeleteDb; shop: string }): Promise<void> {
  const where = { shop }
  await Promise.all([
    db.discountDailyStat.deleteMany({ where }),
    db.visitorSeen.deleteMany({ where }),
    db.bundleOrder.deleteMany({ where }),
    db.metricsSync.deleteMany({ where }),
  ])
}

interface VisitDb {
  visitorSeen: { create: (args: { data: { shop: string; discountId: string; day: string; visitorKey: string } }) => Promise<unknown> }
  discountDailyStat: {
    upsert: (args: {
      where: { shop_discountId_day: { shop: string; discountId: string; day: string } }
      create: { shop: string; discountId: string; day: string; visitors: number }
      update: { visitors: { increment: number } }
    }) => Promise<unknown>
  }
}

/** Prisma's code for a write that broke a unique key. */
const UNIQUE_KEY_CODE = 'P2002'

export function isDuplicateError(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === UNIQUE_KEY_CODE
}

export function isObjectValue(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

/** Keeps the entries whose value is text: a damaged row must not count a view for a wrong discount. */
export function keepTextValues({ value, tools }: { value: unknown; tools: StoreTools }): Record<string, string> {
  if (!tools.isObjectValue(value) || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

/** The small checks the store functions call, handed in so each can be tried alone. */
export const STORE_TOOLS = { isDuplicateError, isObjectValue, keepTextValues }

export type StoreTools = typeof STORE_TOOLS

/** Counts a visitor once per shop, discount and day: the row that remembers them is the guard, and only a new row adds one. */
export async function addVisit({ db, shop, discountId, day, visitorKey, tools }: { db: VisitDb; shop: string; discountId: string; day: string; visitorKey: string; tools: Pick<StoreTools, 'isDuplicateError'> }): Promise<'counted' | 'duplicate'> {
  try {
    await db.visitorSeen.create({ data: { shop, discountId, day, visitorKey } })
  } catch (error) {
    if (tools.isDuplicateError(error)) return 'duplicate'
    throw error
  }
  await db.discountDailyStat.upsert({
    where: { shop_discountId_day: { shop, discountId, day } },
    create: { shop, discountId, day, visitors: 1 },
    update: { visitors: { increment: 1 } },
  })
  return 'counted'
}

/** Visit rows are only needed during their own day. */
export async function purgeOldVisits({ db, shop, beforeDay }: { db: { visitorSeen: { deleteMany: (args: { where: { shop: string; day: { lt: string } } }) => Promise<unknown> } }; shop: string; beforeDay: string }): Promise<void> {
  await db.visitorSeen.deleteMany({ where: { shop, day: { lt: beforeDay } } })
}

/** The cached shop time zone and the map of products in live discounts; null when the shop has no row yet. */
export async function readSettings({ db, shop, tools }: { db: { metricsSync: { findUnique: (args: { where: { shop: string } }) => Promise<{ timeZone: string; liveProducts: unknown } | null> } }; shop: string; tools: StoreTools }): Promise<{ timeZone: string; liveProducts: Record<string, string> } | null> {
  const row = await db.metricsSync.findUnique({ where: { shop } })
  return row ? { timeZone: row.timeZone, liveProducts: tools.keepTextValues({ value: row.liveProducts, tools }) } : null
}

type SettingsUpsertDb = { metricsSync: { upsert: (args: { where: { shop: string }; create: { shop: string; liveProducts?: Record<string, string>; timeZone?: string }; update: { liveProducts?: Record<string, string>; timeZone?: string } }) => Promise<unknown> } }

/** Saves the map of products in live discounts, creating the shop's row (with the default time zone) if it has none. */
export async function saveLiveProducts({ db, shop, liveProducts }: { db: SettingsUpsertDb; shop: string; liveProducts: Record<string, string> }): Promise<void> {
  await db.metricsSync.upsert({ where: { shop }, create: { shop, liveProducts }, update: { liveProducts } })
}

/** Saves the shop's time zone, creating the shop's row if it has none. */
export async function saveTimeZone({ db, shop, timeZone }: { db: SettingsUpsertDb; shop: string; timeZone: string }): Promise<void> {
  await db.metricsSync.upsert({ where: { shop }, create: { shop, timeZone }, update: { timeZone } })
}

interface BundleOrderData {
  orderedAt: Date
  currency: string
  units: number
  orderSubtotal: number
  discountAmount: number
  addedRevenue: number
}

interface BundleOrderUpsertDb {
  bundleOrder: {
    upsert: (args: {
      where: { shop_orderId_discountId: { shop: string; orderId: string; discountId: string } }
      create: BundleOrderData & { shop: string; orderId: string; discountId: string }
      update: BundleOrderData
    }) => Promise<unknown>
  }
}

/** Saves the rows one by one, each on the shop, order and discount key: saving the same order again changes nothing but its values. */
export async function saveBundleRows({ db, shop, rows }: { db: BundleOrderUpsertDb; shop: string; rows: BundleOrderRow[] }): Promise<void> {
  for (const { discountId, orderId, orderedAt, ...values } of rows) {
    const data = { ...values, orderedAt: new Date(orderedAt) }
    await db.bundleOrder.upsert({ where: { shop_orderId_discountId: { shop, orderId, discountId } }, create: { shop, orderId, discountId, ...data }, update: data })
  }
}

interface StoredBundleOrder {
  discountId: string
  orderId: string
  orderedAt: Date
  currency: string
  units: number
  orderSubtotal: unknown
  discountAmount: unknown
  addedRevenue: unknown
}

function convertStoredOrder(stored: StoredBundleOrder): BundleOrderRow {
  return {
    discountId: stored.discountId,
    orderId: stored.orderId,
    orderedAt: stored.orderedAt.toISOString(),
    currency: stored.currency,
    units: stored.units,
    orderSubtotal: Number(stored.orderSubtotal),
    discountAmount: Number(stored.discountAmount),
    addedRevenue: Number(stored.addedRevenue),
  }
}

/** The rows of the orders placed from `fromIso` up to, but not including, `toIso`. */
export async function readOrderRows({ db, shop, fromIso, toIso }: { db: { bundleOrder: { findMany: (args: { where: { shop: string; orderedAt: { gte: Date; lt: Date } } }) => Promise<StoredBundleOrder[]> } }; shop: string; fromIso: string; toIso: string }): Promise<BundleOrderRow[]> {
  const stored = await db.bundleOrder.findMany({ where: { shop, orderedAt: { gte: new Date(fromIso), lt: new Date(toIso) } } })
  return stored.map(convertStoredOrder)
}

/** The visitors of every discount over the days from `fromDay` to `toDay`, both included (days are `YYYY-MM-DD`, which sort as text). */
export async function readVisitorSum({ db, shop, fromDay, toDay }: { db: { discountDailyStat: { aggregate: (args: { where: { shop: string; day: { gte: string; lte: string } }; _sum: { visitors: true } }) => Promise<{ _sum: { visitors: number | null } }> } }; shop: string; fromDay: string; toDay: string }): Promise<number> {
  const result = await db.discountDailyStat.aggregate({ where: { shop, day: { gte: fromDay, lte: toDay } }, _sum: { visitors: true } })
  return result._sum.visitors ?? 0
}

/** The map of products in live discounts that the storefront and the orders read; empty when the shop has no row yet. */
export async function readLiveProducts({ db, shop, tools }: { db: { metricsSync: { findUnique: (args: { where: { shop: string }; select: { liveProducts: true } }) => Promise<{ liveProducts: unknown } | null> } }; shop: string; tools: StoreTools }): Promise<Record<string, string>> {
  const row = await db.metricsSync.findUnique({ where: { shop }, select: { liveProducts: true } })
  return tools.keepTextValues({ value: row?.liveProducts, tools })
}

export interface SyncMarker {
  lastOrderSyncAt: string | null
  backfilledUntil: string | null
}

interface MarkerRow {
  lastOrderSyncAt: Date | null
  backfilledUntil: Date | null
}

const EMPTY_MARKER_ROW: MarkerRow = { lastOrderSyncAt: null, backfilledUntil: null }

export function formatTime({ value }: { value: Date | null }): string | null {
  return value ? value.toISOString() : null
}

export function buildMarker({ row, tools }: { row: MarkerRow; tools: Pick<MarkerTools, 'formatTime'> }): SyncMarker {
  return { lastOrderSyncAt: tools.formatTime({ value: row.lastOrderSyncAt }), backfilledUntil: tools.formatTime({ value: row.backfilledUntil }) }
}

interface MarkerTools {
  formatTime: typeof formatTime
  buildMarker: typeof buildMarker
}

export const MARKER_TOOLS: MarkerTools = { formatTime, buildMarker }

/** How far the orders have been read: the time of the last sync, and the oldest time the first read went back to. Both null for a shop with no row. */
export async function readSyncMarker({ db, shop, tools = MARKER_TOOLS }: { db: { metricsSync: { findUnique: (args: { where: { shop: string }; select: { lastOrderSyncAt: true; backfilledUntil: true } }) => Promise<MarkerRow | null> } }; shop: string; tools?: MarkerTools }): Promise<SyncMarker> {
  const row = await db.metricsSync.findUnique({ where: { shop }, select: { lastOrderSyncAt: true, backfilledUntil: true } })
  return tools.buildMarker({ row: row ?? EMPTY_MARKER_ROW, tools })
}

export async function writeSyncMarker({ db, shop, lastOrderSyncAt, backfilledUntil }: { db: { metricsSync: { upsert: (args: { where: { shop: string }; create: { shop: string; lastOrderSyncAt: Date; backfilledUntil: Date }; update: { lastOrderSyncAt: Date; backfilledUntil: Date } }) => Promise<unknown> } }; shop: string; lastOrderSyncAt: string; backfilledUntil: string }): Promise<void> {
  const data = { lastOrderSyncAt: new Date(lastOrderSyncAt), backfilledUntil: new Date(backfilledUntil) }
  await db.metricsSync.upsert({ where: { shop }, create: { shop, ...data }, update: data })
}
