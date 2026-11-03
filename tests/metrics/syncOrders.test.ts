import { describe, it, expect, vi } from 'vitest'
import { syncOrders, SYNC_TOOLS } from '@/metrics/syncOrders'
import { readGraphqlOrder, READ_ORDER_TOOLS } from '@/metrics/readOrder'
import { listBundleRows, LIST_ROWS_TOOLS } from '@/metrics/listBundleRows'
import type { BundleOrderRow, OrderFacts } from '@/metrics/types'

const SHOP = 'demo.myshopify.com'
const NOW = '2026-11-02T12:00:00.000Z'
const HOUR = 3600 * 1000
const DAY = 24 * HOUR
const PRODUCT = 'gid://shopify/Product/9001'

/** An order the way the Admin API query answers it, with one bundle line. */
const node = (number: number, createdAt: string) => ({
  id: `gid://shopify/Order/${number}`,
  createdAt,
  currentSubtotalPriceSet: { shopMoney: { amount: '17.25', currencyCode: 'GBP' } },
  lineItems: { nodes: [{ product: { id: PRODUCT }, quantity: 10, originalUnitPriceSet: { shopMoney: { amount: '1.69' } }, discountAllocations: [{ allocatedAmountSet: { shopMoney: { amount: '1.65' } }, discountApplication: { __typename: 'AutomaticDiscountApplication', title: 'Product tier discounts' } }] }] },
})
const minutesAfter = (start: string, count: number) => new Date(Date.parse(start) + count * 60_000).toISOString()

function makeTools({ pages = [[]] as object[][], marker = { lastOrderSyncAt: null as string | null, backfilledUntil: null as string | null } } = {}) {
  const saved = new Map<string, BundleOrderRow>()
  let currentMarker = marker
  return {
    saved,
    readMarker: vi.fn(async () => currentMarker),
    writeMarker: vi.fn(async (args: { lastOrderSyncAt: string; backfilledUntil: string }) => { currentMarker = args }),
    queryOrders: vi.fn(async ({ afterCursor }: { shop: string; sinceIso: string; afterCursor: string | null }) => {
      const index = afterCursor === null ? 0 : Number(afterCursor)
      return { nodes: pages[index] ?? [], endCursor: String(index + 1), hasNextPage: index + 1 < pages.length }
    }),
    readLiveProducts: vi.fn(async () => ({ [PRODUCT]: 'd1' })),
    saveRows: vi.fn(async ({ rows }: { rows: BundleOrderRow[] }) => { for (const row of rows) saved.set(`${row.orderId}|${row.discountId}`, row) }),
    readOrder: ({ node: raw }: { node: unknown }): OrderFacts | null => readGraphqlOrder({ node: raw, tools: READ_ORDER_TOOLS }),
    listRows: ({ order, productDiscounts }: { order: OrderFacts; productDiscounts: Record<string, string> }) => listBundleRows({ order, productDiscounts, tools: LIST_ROWS_TOOLS }),
    ...SYNC_TOOLS,
  }
}
const run = (tools: ReturnType<typeof makeTools>, nowIso = NOW) => syncOrders({ shop: SHOP, nowIso, tools })

describe('syncOrders', () => {
  it('reads 90 days back on the first run, saves the orders and records the marker', async () => {
    const tools = makeTools({ pages: [[node(1, '2026-10-30T10:00:00Z')]] })
    expect(await run(tools)).toBe('synced')
    expect(tools.queryOrders).toHaveBeenCalledWith({ shop: SHOP, sinceIso: new Date(Date.parse(NOW) - 90 * DAY).toISOString(), afterCursor: null })
    expect([...tools.saved.keys()]).toEqual(['gid://shopify/Order/1|d1'])
    expect(tools.writeMarker).toHaveBeenCalledWith({ shop: SHOP, lastOrderSyncAt: NOW, backfilledUntil: new Date(Date.parse(NOW) - 90 * DAY).toISOString() })
  })

  it('does nothing, and asks Shopify nothing, when the last sync was less than an hour ago', async () => {
    const tools = makeTools({ marker: { lastOrderSyncAt: new Date(Date.parse(NOW) - 10 * 60_000).toISOString(), backfilledUntil: '2026-08-04T12:00:00.000Z' } })
    expect(await run(tools)).toBe('up-to-date')
    expect(tools.queryOrders).not.toHaveBeenCalled()
    expect(tools.writeMarker).not.toHaveBeenCalled()
  })

  it('goes back one hour before the marker when the last sync was longer ago, and keeps the backfill date', async () => {
    const marker = new Date(Date.parse(NOW) - 5 * HOUR).toISOString()
    const tools = makeTools({ marker: { lastOrderSyncAt: marker, backfilledUntil: '2026-08-04T12:00:00.000Z' } })
    await run(tools)
    expect(tools.queryOrders.mock.calls[0][0].sinceIso).toBe(new Date(Date.parse(marker) - HOUR).toISOString())
    expect(tools.writeMarker).toHaveBeenCalledWith({ shop: SHOP, lastOrderSyncAt: NOW, backfilledUntil: '2026-08-04T12:00:00.000Z' })
  })

  it('reads every page when there are two', async () => {
    const tools = makeTools({ pages: [[node(1, '2026-10-30T10:00:00Z')], [node(2, '2026-10-31T10:00:00Z')]] })
    await run(tools)
    expect(tools.queryOrders).toHaveBeenCalledTimes(2)
    expect(tools.saved.size).toBe(2)
  })

  it('stops at 10 pages and puts the marker at the time of the last order read, so the next call goes on from there', async () => {
    const start = '2026-08-10T00:00:00Z'
    const pages = Array.from({ length: 11 }, (_unused, index) => [node(index + 1, minutesAfter(start, index))])
    const tools = makeTools({ pages })
    expect(await run(tools)).toBe('synced')
    expect(tools.queryOrders).toHaveBeenCalledTimes(10)
    expect(tools.writeMarker.mock.calls[0][0].lastOrderSyncAt).toBe(minutesAfter(start, 9))
    expect(tools.saved.size).toBe(10)
  })

  it('changes nothing when it runs over orders that are already saved', async () => {
    const tools = makeTools({ pages: [[node(1, '2026-10-30T10:00:00Z')]] })
    await run(tools)
    const before = JSON.stringify([...tools.saved.entries()])
    await run(tools, new Date(Date.parse(NOW) + 2 * HOUR).toISOString())
    expect(JSON.stringify([...tools.saved.entries()])).toBe(before)
    expect(tools.saved.size).toBe(1)
  })

  it('skips an order it cannot read and goes on with the others', async () => {
    const tools = makeTools({ pages: [[{ id: 5 }, node(2, '2026-10-31T10:00:00Z')]] })
    await run(tools)
    expect([...tools.saved.keys()]).toEqual(['gid://shopify/Order/2|d1'])
  })

  it.each([
    'Access denied for orders field. Required access: `read_orders` access scope.',
    'This app is not approved to access the Order object. See https://shopify.dev/docs/apps/launch/protected-customer-data',
  ])('answers needs-permission, and writes nothing, when Shopify refuses access: %s', async (message) => {
    const tools = makeTools()
    tools.queryOrders.mockRejectedValueOnce(new Error(message))
    expect(await run(tools)).toBe('needs-permission')
    expect(tools.writeMarker).not.toHaveBeenCalled()
    expect(tools.saveRows).not.toHaveBeenCalled()
  })

  it('throws any other error and leaves the marker alone, so the next call tries again', async () => {
    const tools = makeTools()
    tools.queryOrders.mockRejectedValueOnce(new Error('Shopify API error (HTTP 500)'))
    await expect(run(tools)).rejects.toThrow('HTTP 500')
    expect(tools.writeMarker).not.toHaveBeenCalled()
  })
})
