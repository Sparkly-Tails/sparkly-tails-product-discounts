// The only place the homepage metrics tables are read and written. Every function gets the database as a parameter
// (the Prisma client, or a fake with the same methods in a test).

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
