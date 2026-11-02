import { describe, it, expect, vi } from 'vitest'
import { deleteShopMetrics, addVisit, purgeOldVisits, readSettings, saveLiveProducts, saveTimeZone, saveBundleRows, readOrderRows, readVisitorSum, STORE_TOOLS } from '@/metrics/store'

const SHOP = 'demo.myshopify.com'
const makeDb = () => ({
  discountDailyStat: { deleteMany: vi.fn(async () => ({ count: 1 })) },
  visitorSeen: { deleteMany: vi.fn(async () => ({ count: 1 })) },
  bundleOrder: { deleteMany: vi.fn(async () => ({ count: 1 })) },
  metricsSync: { deleteMany: vi.fn(async () => ({ count: 1 })) },
})

describe('deleteShopMetrics', () => {
  it('deletes the rows of the shop, and only of the shop, in all four tables', async () => {
    const db = makeDb()
    await deleteShopMetrics({ db, shop: SHOP })
    for (const table of Object.values(db)) expect(table.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { shop: SHOP } })
  })
})

describe('addVisit', () => {
  const visit = { shop: SHOP, discountId: 'd1', day: '2026-11-02', visitorKey: 'key-1' }
  const makeVisitDb = (createError?: unknown) => ({
    visitorSeen: { create: vi.fn(async () => { if (createError) throw createError; return {} }) },
    discountDailyStat: { upsert: vi.fn(async () => ({})) },
  })

  it('remembers the visitor and adds one to the day\'s count', async () => {
    const db = makeVisitDb()
    expect(await addVisit({ db, ...visit, tools: STORE_TOOLS })).toBe('counted')
    expect(db.visitorSeen.create).toHaveBeenCalledExactlyOnceWith({ data: visit })
    expect(db.discountDailyStat.upsert).toHaveBeenCalledExactlyOnceWith({
      where: { shop_discountId_day: { shop: SHOP, discountId: 'd1', day: '2026-11-02' } },
      create: { shop: SHOP, discountId: 'd1', day: '2026-11-02', visitors: 1 },
      update: { visitors: { increment: 1 } },
    })
  })

  it('adds nothing when the visitor was already counted that day', async () => {
    const db = makeVisitDb({ code: 'P2002' })
    expect(await addVisit({ db, ...visit, tools: STORE_TOOLS })).toBe('duplicate')
    expect(db.discountDailyStat.upsert).not.toHaveBeenCalled()
  })

  it('does not hide any other database error', async () => {
    await expect(addVisit({ db: makeVisitDb(new Error('connection lost')), ...visit, tools: STORE_TOOLS })).rejects.toThrow('connection lost')
  })
})

describe('purgeOldVisits', () => {
  it('deletes the shop\'s visits from days before the given day', async () => {
    const db = { visitorSeen: { deleteMany: vi.fn(async () => ({ count: 2 })) } }
    await purgeOldVisits({ db, shop: SHOP, beforeDay: '2026-10-31' })
    expect(db.visitorSeen.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { shop: SHOP, day: { lt: '2026-10-31' } } })
  })
})

describe('readSettings', () => {
  const dbWith = (row: { timeZone: string; liveProducts: unknown } | null) => ({ metricsSync: { findUnique: vi.fn(async () => row) } })

  it('gives null for a shop with no row', async () => {
    expect(await readSettings({ db: dbWith(null), shop: SHOP, tools: STORE_TOOLS })).toBeNull()
  })

  it('gives the time zone and the product map', async () => {
    const row = { timeZone: 'Europe/Madrid', liveProducts: { 'gid://shopify/Product/9': 'd1' } }
    expect(await readSettings({ db: dbWith(row), shop: SHOP, tools: STORE_TOOLS })).toEqual(row)
  })

  it('keeps only text values of the product map, so a damaged row cannot count a view for a wrong discount', async () => {
    const row = { timeZone: 'UTC', liveProducts: { a: 'd1', b: 5, c: null } }
    expect((await readSettings({ db: dbWith(row), shop: SHOP, tools: STORE_TOOLS }))?.liveProducts).toEqual({ a: 'd1' })
    expect((await readSettings({ db: dbWith({ timeZone: 'UTC', liveProducts: 'oops' }), shop: SHOP, tools: STORE_TOOLS }))?.liveProducts).toEqual({})
  })
})

describe('saveLiveProducts and saveTimeZone', () => {
  it('saveLiveProducts writes only the product map, creating the shop\'s row with the default time zone if needed', async () => {
    const db = { metricsSync: { upsert: vi.fn(async () => ({})) } }
    await saveLiveProducts({ db, shop: SHOP, liveProducts: { a: 'd1' } })
    expect(db.metricsSync.upsert).toHaveBeenCalledExactlyOnceWith({ where: { shop: SHOP }, create: { shop: SHOP, liveProducts: { a: 'd1' } }, update: { liveProducts: { a: 'd1' } } })
  })

  it('saveTimeZone writes only the time zone', async () => {
    const db = { metricsSync: { upsert: vi.fn(async () => ({})) } }
    await saveTimeZone({ db, shop: SHOP, timeZone: 'Europe/Madrid' })
    expect(db.metricsSync.upsert).toHaveBeenCalledExactlyOnceWith({ where: { shop: SHOP }, create: { shop: SHOP, timeZone: 'Europe/Madrid' }, update: { timeZone: 'Europe/Madrid' } })
  })
})

describe('saveBundleRows', () => {
  const rows = [
    { discountId: 'd1', orderId: 'gid://shopify/Order/1', orderedAt: '2026-11-02T10:00:00.000Z', currency: 'GBP', units: 10, orderSubtotal: 17.25, discountAmount: 1.65, addedRevenue: 13.5 },
    { discountId: 'd2', orderId: 'gid://shopify/Order/1', orderedAt: '2026-11-02T10:00:00.000Z', currency: 'GBP', units: 2, orderSubtotal: 17.25, discountAmount: 0.5, addedRevenue: 1 },
  ]

  /** A fake table keyed like the real one: shop + order + discount. */
  function keyedTable() {
    const stored = new Map<string, unknown>()
    const upsert = vi.fn(async (args: { where: { shop_orderId_discountId: { shop: string; orderId: string; discountId: string } }; create: unknown }) => {
      const { shop, orderId, discountId } = args.where.shop_orderId_discountId
      stored.set(`${shop}|${orderId}|${discountId}`, args.create)
    })
    return { stored, upsert }
  }

  it('upserts each row on the shop, order and discount key, so saving the same rows twice makes no second record', async () => {
    const table = keyedTable()
    const db = { bundleOrder: { upsert: table.upsert } }
    await saveBundleRows({ db, shop: SHOP, rows })
    await saveBundleRows({ db, shop: SHOP, rows })
    expect(table.upsert).toHaveBeenCalledTimes(4)
    expect(table.stored.size).toBe(2)
  })

  it('stores the time as a date and the amounts as given', async () => {
    const table = keyedTable()
    await saveBundleRows({ db: { bundleOrder: { upsert: table.upsert } }, shop: SHOP, rows: [rows[0]] })
    expect(table.upsert.mock.calls[0][0].create).toEqual({
      shop: SHOP, orderId: 'gid://shopify/Order/1', discountId: 'd1', orderedAt: new Date('2026-11-02T10:00:00.000Z'), currency: 'GBP', units: 10, orderSubtotal: 17.25, discountAmount: 1.65, addedRevenue: 13.5,
    })
  })
})

describe('readOrderRows', () => {
  it('asks for the orders from the first time up to but not including the second, and gives plain numbers', async () => {
    const findMany = vi.fn(async () => [{ discountId: 'd1', orderId: 'o1', orderedAt: new Date('2026-11-02T10:00:00.000Z'), currency: 'GBP', units: 3, orderSubtotal: { toString: () => '17.25' }, discountAmount: { toString: () => '1.65' }, addedRevenue: { toString: () => '13.50' } }])
    const result = await readOrderRows({ db: { bundleOrder: { findMany } }, shop: SHOP, fromIso: '2026-11-01T00:00:00.000Z', toIso: '2026-11-03T00:00:00.000Z' })
    expect(findMany).toHaveBeenCalledWith({ where: { shop: SHOP, orderedAt: { gte: new Date('2026-11-01T00:00:00.000Z'), lt: new Date('2026-11-03T00:00:00.000Z') } } })
    expect(result).toEqual([{ discountId: 'd1', orderId: 'o1', orderedAt: '2026-11-02T10:00:00.000Z', currency: 'GBP', units: 3, orderSubtotal: 17.25, discountAmount: 1.65, addedRevenue: 13.5 }])
  })
})

describe('readVisitorSum', () => {
  it('adds the visitors of every discount from the first day to the last day, both included', async () => {
    const aggregate = vi.fn(async () => ({ _sum: { visitors: 42 } }))
    expect(await readVisitorSum({ db: { discountDailyStat: { aggregate } }, shop: SHOP, fromDay: '2026-10-04', toDay: '2026-11-02' })).toBe(42)
    expect(aggregate).toHaveBeenCalledWith({ where: { shop: SHOP, day: { gte: '2026-10-04', lte: '2026-11-02' } }, _sum: { visitors: true } })
  })

  it('is 0 when there are no days', async () => {
    const aggregate = vi.fn(async () => ({ _sum: { visitors: null } }))
    expect(await readVisitorSum({ db: { discountDailyStat: { aggregate } }, shop: SHOP, fromDay: '2026-10-04', toDay: '2026-11-02' })).toBe(0)
  })
})
