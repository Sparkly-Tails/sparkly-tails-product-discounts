import { describe, it, expect, vi } from 'vitest'
import { deleteShopMetrics, addVisit, purgeOldVisits, readSettings, saveLiveProducts, saveTimeZone, STORE_TOOLS } from '@/metrics/store'

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
