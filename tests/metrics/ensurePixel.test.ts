import { describe, it, expect, vi } from 'vitest'
import { ensureMetricsPixel, ensureMetricsPixelSafely, readAppOrigin, PIXEL_TOOLS } from '@/metrics/ensurePixel'

const SHOP = 'demo.myshopify.com'
const URL_NOW = 'https://my-app.vercel.app/collect/view'
const PIXEL_ID = 'gid://shopify/WebPixel/1'

type Call = { query: string; variables?: Record<string, unknown> }

/** A stand-in for the Admin API: answers the pixel query with `pixel` (or throws), and every mutation with `mutation`. */
function fakeShop({ pixel = null as { id: string; settings: unknown } | null, queryFails = false, mutation = { userErrors: [] as { code?: string; message: string }[] } } = {}) {
  const calls: Call[] = []
  const queryShop = vi.fn(async ({ query, variables }: { query: string; variables?: Record<string, unknown> }) => {
    calls.push({ query, variables })
    if (query.includes('mutation')) return { webPixelCreate: mutation, webPixelUpdate: mutation }
    if (queryFails) throw new Error('No web pixel was found for this app and shop')
    return { webPixel: pixel }
  })
  const mutations = () => calls.filter((call) => call.query.includes('mutation'))
  return { queryShop, calls, mutations }
}

const run = (fake: ReturnType<typeof fakeShop>, collectUrl = URL_NOW) => ensureMetricsPixel({ shop: SHOP, collectUrl, queryShop: fake.queryShop, tools: PIXEL_TOOLS })
const settingsOf = (collectUrl: string) => ({ collectUrl, shop: SHOP })

describe('readAppOrigin', () => {
  it('builds the address from the host of the request, so every deployment uses its own', () => {
    expect(readAppOrigin({ host: 'my-app.vercel.app', protocol: 'https' })).toBe('https://my-app.vercel.app')
  })

  it.each([['an empty host', ''], ['a host with a path', 'a.com/x'], ['a host with credentials', 'user@a.com'], ['a list of hosts', 'a.com, b.com'], ['a host with a space', 'a .com']])('gives null for %s', (_name, host) => {
    expect(readAppOrigin({ host, protocol: 'https' })).toBeNull()
  })
})

describe('ensureMetricsPixel', () => {
  it('leaves a pixel that already has the same address and shop, and sends no mutation', async () => {
    const fake = fakeShop({ pixel: { id: PIXEL_ID, settings: JSON.stringify(settingsOf(URL_NOW)) } })
    expect(await run(fake)).toBe('exists')
    expect(fake.mutations()).toHaveLength(0)
  })

  it('reads settings that come back as an object as well as settings that come back as text', async () => {
    const fake = fakeShop({ pixel: { id: PIXEL_ID, settings: settingsOf(URL_NOW) } })
    expect(await run(fake)).toBe('exists')
  })

  it('updates a pixel that points at another address', async () => {
    const fake = fakeShop({ pixel: { id: PIXEL_ID, settings: JSON.stringify(settingsOf('https://old.example.app/collect/view')) } })
    expect(await run(fake)).toBe('updated')
    expect(fake.mutations()[0].variables).toEqual({ id: PIXEL_ID, webPixel: { settings: settingsOf(URL_NOW) } })
  })

  it('creates the pixel when the shop has none, with the address and the shop as settings', async () => {
    const fake = fakeShop()
    expect(await run(fake)).toBe('created')
    expect(fake.mutations()[0].variables).toEqual({ webPixel: { settings: settingsOf(URL_NOW) } })
  })

  it('creates the pixel when the lookup itself answers with an error, as Shopify does for an app with no pixel', async () => {
    const fake = fakeShop({ queryFails: true })
    expect(await run(fake)).toBe('created')
  })

  it('counts a pixel that is already there as existing when the create answers TAKEN', async () => {
    const fake = fakeShop({ queryFails: true, mutation: { userErrors: [{ code: 'TAKEN', message: 'taken' }] } })
    expect(await run(fake)).toBe('exists')
  })

  it('throws the message of any other user error', async () => {
    const fake = fakeShop({ mutation: { userErrors: [{ code: 'INVALID_SETTINGS', message: 'Missing keys: collectUrl' }] } })
    await expect(run(fake)).rejects.toThrow('Missing keys: collectUrl')
  })
})

describe('ensureMetricsPixelSafely', () => {
  const safely = (fake: ReturnType<typeof fakeShop>, over: Partial<{ collectUrl: string | null }> = {}) => {
    const report = vi.fn()
    const result = ensureMetricsPixelSafely({ collectUrl: URL_NOW, ...over, getShop: async () => SHOP, queryShop: fake.queryShop, report, tools: PIXEL_TOOLS })
    return { result, report }
  }

  it('gives the outcome of the ensure', async () => {
    expect(await safely(fakeShop()).result).toBe('created')
  })

  it('never throws: a refused mutation becomes failed, with the reason reported', async () => {
    const { result, report } = safely(fakeShop({ mutation: { userErrors: [{ code: 'INVALID_SETTINGS', message: 'bad' }] } }))
    expect(await result).toBe('failed')
    expect(report).toHaveBeenCalledWith(expect.stringContaining('bad'))
  })

  it('does nothing, and says so, when the address of the app is not known', async () => {
    const fake = fakeShop()
    const { result, report } = safely(fake, { collectUrl: null })
    expect(await result).toBe('failed')
    expect(fake.calls).toHaveLength(0)
    expect(report).toHaveBeenCalledTimes(1)
  })
})
