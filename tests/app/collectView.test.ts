import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST, OPTIONS } from '@/app/collect/view/route'
import { addVisit, readSettings } from '@/metrics/store'

vi.mock('@/lib/db', () => ({ getDb: () => ({ marker: 'db' }) }))
vi.mock('@/metrics/store', async (original) => ({
  ...(await original<typeof import('@/metrics/store')>()),
  readSettings: vi.fn(),
  addVisit: vi.fn(async () => 'counted'),
  purgeOldVisits: vi.fn(async () => {}),
}))

const GOOD = { shop: 'demo.myshopify.com', productId: 'gid://shopify/Product/9', clientId: 'abc-123' }
const post = (body: string) => new Request('https://app.test/collect/view', { method: 'POST', body, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  process.env.SHOPIFY_API_SECRET_KEY = 'secret'
  vi.mocked(addVisit).mockClear()
  vi.mocked(readSettings).mockReset()
  vi.mocked(readSettings).mockResolvedValue({ timeZone: 'UTC', liveProducts: { [GOOD.productId]: 'd1' } })
})

describe('POST /collect/view', () => {
  it('counts a valid view and answers 204 with no body, open to the pixel\'s origin', async () => {
    const response = await POST(post(JSON.stringify(GOOD)))
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(addVisit).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a body that is not JSON', '{oops'],
    ['an unknown shop kind of host', JSON.stringify({ ...GOOD, shop: 'evil.example.com' })],
    ['an oversized body', JSON.stringify({ ...GOOD, extra: 'x'.repeat(5000) })],
  ])('answers 204 and stores nothing for %s', async (_name, body) => {
    const response = await POST(post(body))
    expect(response.status).toBe(204)
    expect(addVisit).not.toHaveBeenCalled()
  })

  it('answers 204 and stores nothing for a shop the app has no row for, the same as for a good view', async () => {
    vi.mocked(readSettings).mockResolvedValue(null)
    expect((await POST(post(JSON.stringify(GOOD)))).status).toBe(204)
    expect(addVisit).not.toHaveBeenCalled()
  })

  it('answers 204 and stores nothing for a product in no live discount', async () => {
    expect((await POST(post(JSON.stringify({ ...GOOD, productId: 'gid://shopify/Product/77' })))).status).toBe(204)
    expect(addVisit).not.toHaveBeenCalled()
  })

  it('answers 204 even when the database fails, and says nothing about why', async () => {
    vi.mocked(readSettings).mockRejectedValue(new Error('connection lost'))
    const response = await POST(post(JSON.stringify(GOOD)))
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
  })

  it('stores nothing when the secret is missing', async () => {
    delete process.env.SHOPIFY_API_SECRET_KEY
    expect((await POST(post(JSON.stringify(GOOD)))).status).toBe(204)
    expect(addVisit).not.toHaveBeenCalled()
  })
})

describe('OPTIONS /collect/view', () => {
  it('answers the pixel\'s CORS preflight', () => {
    const response = OPTIONS()
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('access-control-allow-methods')).toContain('POST')
    expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('content-type')
  })
})
