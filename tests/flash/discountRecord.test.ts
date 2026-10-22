import { describe, it, expect, vi } from 'vitest'
import { syncDiscountRecord, decideRecordStep, DISCOUNT_RECORD_TOOLS } from '@/flash/discountRecord'
import type { ShopifyQuery } from '@/flash/shopifyRecord'

const NOW = '2026-11-01T10:00'
const FUTURE = { startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59' }
const OVER = { startsAt: '2026-10-01T09:00', endsAt: '2026-10-02T09:00' }

function setup(over: Partial<Parameters<typeof syncDiscountRecord>[0]> = {}) {
  const calls: string[] = []
  const tools = {
    ...DISCOUNT_RECORD_TOOLS,
    allowShared: vi.fn(async () => { calls.push('combine'); return 'updated' as const }),
    syncRecord: vi.fn(async (options: { shopifyDiscountId: string | undefined }) => { calls.push('sync'); return options.shopifyDiscountId ?? 'gid://shopify/DiscountAutomaticNode/9' }),
  }
  const options = {
    query: vi.fn() as unknown as ShopifyQuery,
    discountId: 'disc_1',
    title: 'Black Friday',
    status: 'live' as const,
    flash: FUTURE as { startsAt: string; endsAt: string } | undefined,
    shopifyDiscountId: undefined as string | undefined,
    nowLocal: NOW,
    convertToUtc: (naive: string) => naive + ':00.000Z',
    ...over,
  }
  return { calls, tools, options }
}

describe('decideRecordStep', () => {
  it('keeps the record of a live sale that is over, prepares for one that is running, and syncs everything else', () => {
    expect(decideRecordStep({ status: 'live', hasFlash: true, isOver: true })).toBe('keep')
    expect(decideRecordStep({ status: 'live', hasFlash: true, isOver: false })).toBe('prepare')
    expect(decideRecordStep({ status: 'draft', hasFlash: true, isOver: false })).toBe('sync')
    expect(decideRecordStep({ status: 'draft', hasFlash: true, isOver: true })).toBe('sync')
    expect(decideRecordStep({ status: 'live', hasFlash: false, isOver: false })).toBe('sync')
  })
})

describe('syncDiscountRecord', () => {
  it('lets the shared record combine before it creates the record of a live running sale, and returns the new id', async () => {
    const { calls, tools, options } = setup()
    const id = await syncDiscountRecord({ ...options, tools })
    expect(calls).toEqual(['combine', 'sync'])
    expect(id).toBe('gid://shopify/DiscountAutomaticNode/9')
  })

  it('passes the title, the window and the record id on to the record sync', async () => {
    const { tools, options } = setup({ shopifyDiscountId: 'gid://shopify/DiscountAutomaticNode/5' })
    await syncDiscountRecord({ ...options, tools })
    expect(tools.syncRecord).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Black Friday', discountId: 'disc_1', status: 'live', flash: FUTURE, shopifyDiscountId: 'gid://shopify/DiscountAutomaticNode/5',
    }))
  })

  it('leaves the record of a sale that is over alone: no Shopify call, the same id comes back', async () => {
    const { calls, tools, options } = setup({ flash: OVER, shopifyDiscountId: 'gid://shopify/DiscountAutomaticNode/5' })
    expect(await syncDiscountRecord({ ...options, tools })).toBe('gid://shopify/DiscountAutomaticNode/5')
    expect(calls).toEqual([])
  })

  it('syncs without touching the shared record when the discount is a draft (the record is deleted)', async () => {
    const { calls, tools, options } = setup({ status: 'draft', shopifyDiscountId: 'gid://shopify/DiscountAutomaticNode/5' })
    await syncDiscountRecord({ ...options, tools })
    expect(calls).toEqual(['sync'])
  })

  it('syncs without touching the shared record when flash is switched off', async () => {
    const { calls, tools, options } = setup({ flash: undefined, shopifyDiscountId: 'gid://shopify/DiscountAutomaticNode/5' })
    await syncDiscountRecord({ ...options, tools })
    expect(calls).toEqual(['sync'])
  })

  it('stops with Shopify\'s message when the shared record cannot be changed, before any record is created', async () => {
    const { calls, tools, options } = setup()
    tools.allowShared.mockRejectedValueOnce(new Error('Not allowed.'))
    await expect(syncDiscountRecord({ ...options, tools })).rejects.toThrow('Not allowed.')
    expect(calls).toEqual([])
  })
})
