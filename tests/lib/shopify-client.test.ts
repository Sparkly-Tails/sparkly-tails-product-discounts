import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shopifyQuery } from '@/lib/shopify-client'
import { getAccessToken } from '@/lib/getAccessToken'

vi.mock('@/lib/getAccessToken', () => ({ getAccessToken: vi.fn() }))

describe('shopifyQuery', () => {
  beforeEach(() => {
    process.env.SHOPIFY_SHOP = 'test.myshopify.com'
    vi.mocked(getAccessToken).mockReset()
    vi.mocked(getAccessToken).mockResolvedValue('test-token')
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

  it('sends the token from getAccessToken to the configured shop', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ data: {} }) } as Response)

    await shopifyQuery('query { shop { id } }')

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toMatch(/^https:\/\/test\.myshopify\.com\/admin\/api\/.+\/graphql\.json$/)
    expect((init as RequestInit).headers).toMatchObject({ 'X-Shopify-Access-Token': 'test-token' })
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

  it('passes along the error when no access token can be obtained', async () => {
    vi.mocked(getAccessToken).mockRejectedValue(new Error('open the app from Shopify admin'))
    await expect(shopifyQuery('query { shop { id } }')).rejects.toThrow('open the app from Shopify admin')
    expect(fetch).not.toHaveBeenCalled()
  })
})
