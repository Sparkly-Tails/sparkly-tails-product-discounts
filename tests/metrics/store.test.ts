import { describe, it, expect, vi } from 'vitest'
import { deleteShopMetrics } from '@/metrics/store'

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
