import { describe, it, expect, vi } from 'vitest'
import { recordView, pickViewTarget } from '@/metrics/recordView'

const SHOP = 'demo.myshopify.com'
const PRODUCT = 'gid://shopify/Product/9'
const OTHER_PRODUCT = 'gid://shopify/Product/10'
const NOW = Date.parse('2026-11-02T12:00:00Z')

/** In-memory stand-ins for the database calls, so the rules can be tried without a database. */
function makeTools(settings: { timeZone: string; liveProducts: Record<string, string> } | null = { timeZone: 'UTC', liveProducts: { [PRODUCT]: 'd1', [OTHER_PRODUCT]: 'd1' } }) {
  const seen = new Set<string>()
  const counts: Record<string, number> = {}
  const addVisit = vi.fn(async ({ discountId, day, visitorKey }: { discountId: string; day: string; visitorKey: string }) => {
    const id = `${discountId}|${day}|${visitorKey}`
    if (seen.has(id)) return 'duplicate' as const
    seen.add(id)
    counts[`${discountId}|${day}`] = (counts[`${discountId}|${day}`] ?? 0) + 1
    return 'counted' as const
  })
  return {
    counts,
    addVisit,
    pickViewTarget,
    readSettings: vi.fn(async () => settings),
    purgeVisits: vi.fn(async () => {}),
    buildKey: vi.fn(async ({ clientId, day }: { clientId: string; day: string }) => `${clientId}@${day}`),
    pickDay: ({ nowMs, timeZone }: { nowMs: number; timeZone: string }) => new Date(nowMs).toLocaleDateString('en-CA', { timeZone }),
  }
}
const view = (tools: ReturnType<typeof makeTools>, overrides: Partial<{ productId: string; clientId: string; nowMs: number }> = {}) =>
  recordView({ shop: SHOP, productId: PRODUCT, clientId: 'visitor-1', nowMs: NOW, secret: 's', ...overrides, tools })

describe('recordView', () => {
  it('ignores a product that is in no live discount, and stores nothing', async () => {
    const tools = makeTools()
    expect(await view(tools, { productId: 'gid://shopify/Product/99' })).toBe('ignored')
    expect(tools.addVisit).not.toHaveBeenCalled()
  })

  it('ignores a shop that has no settings row', async () => {
    const tools = makeTools(null)
    expect(await view(tools)).toBe('ignored')
    expect(tools.addVisit).not.toHaveBeenCalled()
  })

  it('counts a first view, and a second view by the same visitor the same day is a duplicate', async () => {
    const tools = makeTools()
    expect(await view(tools)).toBe('counted')
    expect(await view(tools)).toBe('duplicate')
    expect(tools.counts['d1|2026-11-02']).toBe(1)
  })

  it('counts a visitor once per discount per day, however many of its products they view', async () => {
    const tools = makeTools()
    await view(tools)
    expect(await view(tools, { productId: OTHER_PRODUCT })).toBe('duplicate')
  })

  it('counts the same visitor again on the next day of the shop', async () => {
    const tools = makeTools()
    await view(tools)
    expect(await view(tools, { nowMs: NOW + 24 * 3600 * 1000 })).toBe('counted')
    expect(tools.counts['d1|2026-11-03']).toBe(1)
  })

  it('splits the day at the shop\'s midnight, not UTC\'s (Auckland 23:59 and 00:01)', async () => {
    const tools = makeTools({ timeZone: 'Pacific/Auckland', liveProducts: { [PRODUCT]: 'd1' } })
    await view(tools, { nowMs: Date.parse('2026-11-02T10:59:00Z') })
    expect(await view(tools, { nowMs: Date.parse('2026-11-02T11:01:00Z') })).toBe('counted')
  })

  it('removes visits older than two days when it counts one', async () => {
    const tools = makeTools()
    await view(tools)
    expect(tools.purgeVisits).toHaveBeenCalledExactlyOnceWith({ shop: SHOP, beforeDay: '2026-10-31' })
  })
})
