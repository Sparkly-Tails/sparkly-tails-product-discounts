import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shopifyQuery } from '@/lib/shopify-client'

describe('shopifyQuery', () => {
  beforeEach(() => {
    process.env.SHOPIFY_SHOP = 'test.myshopify.com'
    process.env.SHOPIFY_ACCESS_TOKEN = 'test-token'
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns data on a successful query', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { shop: { id: 'gid://shopify/Shop/1' } } }),
    } as Response)

    const result = await shopifyQuery<{ shop: { id: string } }>('query { shop { id } }')
    expect(result).toEqual({ shop: { id: 'gid://shopify/Shop/1' } })
  })

  it('throws with GraphQL error messages when errors are present', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ errors: [{ message: 'Field does not exist' }] }),
    } as Response)

    await expect(shopifyQuery('query { bogus }')).rejects.toThrow('Field does not exist')
  })

  it('throws a clear error on a non-JSON response body', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => { throw new SyntaxError('Unexpected token') },
    } as unknown as Response)

    await expect(shopifyQuery('query { shop { id } }')).rejects.toThrow(/HTTP 502/)
  })

  it('throws when SHOPIFY_SHOP is not set', async () => {
    delete process.env.SHOPIFY_SHOP
    await expect(shopifyQuery('query { shop { id } }')).rejects.toThrow('SHOPIFY_SHOP is not set')
  })
})
