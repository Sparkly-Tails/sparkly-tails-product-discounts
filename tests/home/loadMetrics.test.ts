import { describe, it, expect, vi } from 'vitest'
import { loadMetrics } from '@/home/loadMetrics'
import type { BundleOrderRow } from '@/metrics/types'

function makeArgs(overrides: Record<string, unknown> = {}) {
  const calls: string[] = []
  const args = {
    shop: 'demo.myshopify.com',
    nowIso: '2026-11-02T12:00:00.000Z',
    fromDay: '2026-10-04',
    toDay: '2026-11-02',
    timeZone: 'Europe/London',
    readScopes: vi.fn(async () => { calls.push('scopes'); return ['read_orders', 'read_products'] }),
    syncOrders: vi.fn(async () => { calls.push('sync'); return 'synced' as 'synced' | 'up-to-date' | 'needs-permission' }),
    refresh: vi.fn(async () => { calls.push('refresh') }),
    readRows: vi.fn(async () => { calls.push('rows'); return [{ orderId: 'o1' } as BundleOrderRow] }),
    readVisitors: vi.fn(async () => { calls.push('visitors'); return 12 }),
    sumTotals: vi.fn(({ visitors }: { rows: BundleOrderRow[]; visitors: number }) => ({ visitors, orders: 1, averageOrderValue: 10, addedRevenue: 2 })),
    convertToUtc: vi.fn((naive: string, zone: string) => `${naive}@${zone}`),
    addDays: vi.fn(({ day, count }: { day: string; count: number }) => `${day}+${count}`),
    ...overrides,
  }
  return { args, calls }
}

describe('loadMetrics', () => {
  it('syncs, refreshes the settings, then reads the rows and visitors of the period in the shop time zone', async () => {
    const { args, calls } = makeArgs()
    const result = await loadMetrics(args)
    expect(result).toEqual({ totals: { visitors: 12, orders: 1, averageOrderValue: 10, addedRevenue: 2 }, hasPermission: true })
    expect(calls.indexOf('sync')).toBeLessThan(calls.indexOf('rows'))
    expect(calls.indexOf('refresh')).toBeLessThan(calls.indexOf('rows'))
    expect(args.readRows).toHaveBeenCalledWith({ shop: 'demo.myshopify.com', fromIso: '2026-10-04T00:00@Europe/London', toIso: '2026-11-02+1T00:00@Europe/London' })
    expect(args.readVisitors).toHaveBeenCalledWith({ shop: 'demo.myshopify.com', fromDay: '2026-10-04', toDay: '2026-11-02' })
  })

  it('has no permission, and reads and syncs nothing, when read_orders was not granted', async () => {
    const { args } = makeArgs({ readScopes: vi.fn(async () => ['read_products']) })
    const result = await loadMetrics(args)
    expect(result.hasPermission).toBe(false)
    expect(args.syncOrders).not.toHaveBeenCalled()
    expect(args.readRows).not.toHaveBeenCalled()
  })

  it('has no permission when the sync says so, and reads no rows', async () => {
    const { args } = makeArgs({ syncOrders: vi.fn(async () => 'needs-permission') })
    const result = await loadMetrics(args)
    expect(result.hasPermission).toBe(false)
    expect(args.readRows).not.toHaveBeenCalled()
  })
})
