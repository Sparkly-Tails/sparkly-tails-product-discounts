import { describe, it, expect, vi } from 'vitest'
import { recordOrder } from '@/metrics/recordOrder'
import { readWebhookOrder, READ_ORDER_TOOLS } from '@/metrics/readOrder'
import { listBundleRows, LIST_ROWS_TOOLS } from '@/metrics/listBundleRows'
import type { OrderFacts } from '@/metrics/types'
import sample from '../fixtures/metrics/order-webhook-sample.json'

const SHOP = 'demo.myshopify.com'
const LIVE = { 'gid://shopify/Product/9001': 'd1' }

/** Real readers, with the database calls replaced by spies. */
function makeTools(liveProducts: Record<string, string> = LIVE) {
  return {
    readLiveProducts: vi.fn(async () => liveProducts),
    saveRows: vi.fn(async () => {}),
    readOrder: ({ body }: { body: string }) => readWebhookOrder({ body, tools: READ_ORDER_TOOLS }),
    listRows: ({ order, productDiscounts }: { order: OrderFacts; productDiscounts: Record<string, string> }) => listBundleRows({ order, productDiscounts, tools: LIST_ROWS_TOOLS }),
  }
}
const body = JSON.stringify(sample)

describe('recordOrder', () => {
  it('saves one row for an order with one bundle line, and says so', async () => {
    const tools = makeTools()
    expect(await recordOrder({ body, shop: SHOP, tools })).toBe(1)
    expect(tools.saveRows).toHaveBeenCalledTimes(1)
    const [{ shop, rows }] = tools.saveRows.mock.calls[0] as unknown as [{ shop: string; rows: { discountId: string; units: number; orderSubtotal: number }[] }]
    expect(shop).toBe(SHOP)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ discountId: 'd1', units: 10, orderSubtotal: 17.25 })
  })

  it('saves nothing for an order with no bundle line', async () => {
    const tools = makeTools({})
    expect(await recordOrder({ body, shop: SHOP, tools })).toBe(0)
    expect(tools.saveRows).not.toHaveBeenCalled()
  })

  it('returns 0 for an unreadable body, without throwing and without touching the database', async () => {
    const tools = makeTools()
    expect(await recordOrder({ body: '{oops', shop: SHOP, tools })).toBe(0)
    expect(tools.readLiveProducts).not.toHaveBeenCalled()
    expect(tools.saveRows).not.toHaveBeenCalled()
  })

  it('saves identical rows when the same delivery arrives twice, which the upsert on the order key makes safe', async () => {
    const tools = makeTools()
    await recordOrder({ body, shop: SHOP, tools })
    await recordOrder({ body, shop: SHOP, tools })
    expect(tools.saveRows.mock.calls[0]).toEqual(tools.saveRows.mock.calls[1])
  })
})
