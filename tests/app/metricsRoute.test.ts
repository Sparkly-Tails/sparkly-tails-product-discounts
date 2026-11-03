import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/metrics/route'
import { ensureMetricsPixelSafely } from '@/metrics/ensurePixel'
import { getRequestHost } from '@/lib/requestHost'
import { loadMetrics } from '@/home/loadMetrics'

vi.mock('@/lib/config', () => ({ getConfig: vi.fn(async () => ({ discounts: [] })) }))
vi.mock('@/lib/requestHost', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/requestHost')>()), getRequestHost: vi.fn(async () => 'my-app.vercel.app') }))
vi.mock('@/metrics/ensurePixel', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/metrics/ensurePixel')>()), ensureMetricsPixelSafely: vi.fn(async () => 'created') }))
vi.mock('@/lib/shop', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/shop')>()), getShopTimezone: vi.fn(async () => 'UTC'), getShopCurrencyCode: vi.fn(async () => 'GBP') }))
vi.mock('@/lib/requestShop', () => ({ getRequestShop: vi.fn(async () => 'demo.myshopify.com') }))
vi.mock('@/lib/db', () => ({ getDb: vi.fn(() => ({})) }))
vi.mock('@/home/loadMetrics', () => ({ loadMetrics: vi.fn() }))
vi.mock('next/headers', () => ({ headers: vi.fn() }))

const call = (search = '') => GET(new Request(`https://my-app.vercel.app/api/metrics${search}`))

describe('GET /api/metrics', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.mocked(ensureMetricsPixelSafely).mockClear()
    vi.mocked(loadMetrics).mockReset()
    vi.mocked(loadMetrics).mockResolvedValue({ totals: { visitors: 40, orders: 3, averageOrderValue: 21.5, addedRevenue: 4 }, hasPermission: true })
  })

  it('gives the four cards with the numbers for the last 30 days of the shop', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-02T12:00:00Z'))

    const response = await call()

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.cards.map((card: { value: string }) => card.value)).toEqual(['40', '3', '£21.50', '£4.00'])
    const args = vi.mocked(loadMetrics).mock.calls[0][0]
    expect([args.shop, args.fromDay, args.toDay, args.timeZone]).toEqual(['demo.myshopify.com', '2026-10-04', '2026-11-02', 'UTC'])
  })

  it('says in the answer which days the cards are for, and that no cache may keep the answer', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-02T12:00:00Z'))

    const response = await call('?range=last7')

    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect((await response.json()).range).toEqual({ fromDay: '2026-10-27', toDay: '2026-11-02' })
  })

  it('uses the range in the address', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-02T12:00:00Z'))

    await call('?range=last7')

    const args = vi.mocked(loadMetrics).mock.calls[0][0]
    expect([args.fromDay, args.toDay]).toEqual(['2026-10-27', '2026-11-02'])
  })

  it('asks for the permission on every card when the shop has not approved the scopes', async () => {
    vi.mocked(loadMetrics).mockResolvedValue({ totals: { visitors: 0, orders: 0, averageOrderValue: 0, addedRevenue: 0 }, hasPermission: false })

    const body = await (await call()).json()

    expect(body.cards.map((card: { value: string }) => card.value)).toEqual(Array(4).fill('Needs permission'))
  })

  it('answers with the failed cards, not an error, when the numbers cannot be read', async () => {
    vi.mocked(loadMetrics).mockRejectedValue(new Error('database is down'))

    const response = await call()

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.cards.map((card: { value: string }) => card.value)).toEqual(Array(4).fill('-'))
    expect(body.cards.every((card: { hint: string }) => card.hint === 'Could not load')).toBe(true)
  })

  it('makes sure the metrics pixel points at the address the request came to, and waits for that before it answers', async () => {
    let pixelDone = false
    vi.mocked(ensureMetricsPixelSafely).mockImplementation(async () => { await Promise.resolve(); pixelDone = true; return 'created' })

    await call()

    expect(pixelDone).toBe(true)
    expect(vi.mocked(ensureMetricsPixelSafely).mock.calls[0][0].collectUrl).toBe('https://my-app.vercel.app/collect/view')
  })

  it('has no address for the pixel when the request carries no usable host, and still answers', async () => {
    vi.mocked(getRequestHost).mockResolvedValueOnce('')

    const response = await call()

    expect(response.status).toBe(200)
    expect(vi.mocked(ensureMetricsPixelSafely).mock.calls[0][0].collectUrl).toBeNull()
  })
})
