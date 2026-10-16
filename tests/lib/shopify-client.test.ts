import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { shopifyQuery } from '@/lib/shopify-client'
import { getAccessToken } from '@/lib/getAccessToken'
import { deleteShopSessions } from '@/lib/sessions'

vi.mock('@/lib/getAccessToken', () => ({ getAccessToken: vi.fn() }))
vi.mock('@/lib/sessions', () => ({ deleteShopSessions: vi.fn() }))

describe('shopifyQuery', () => {
  beforeEach(() => {
    process.env.SHOPIFY_SHOP = 'test.myshopify.com'
    vi.mocked(getAccessToken).mockReset()
    vi.mocked(getAccessToken).mockResolvedValue('test-token')
    vi.mocked(deleteShopSessions).mockReset()
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

  describe('when Shopify rejects the stored token with 401', () => {
    const rejected = { ok: false, status: 401, json: async () => ({ errors: 'Invalid API key or access token' }) } as unknown as Response
    const accepted = { ok: true, json: async () => ({ data: { shop: { id: 'gid://shopify/Shop/1' } } }) } as Response

    it('drops the stored session for the shop, gets a fresh token and retries once', async () => {
      vi.mocked(getAccessToken).mockResolvedValueOnce('revoked-token').mockResolvedValueOnce('fresh-token')
      vi.mocked(fetch).mockResolvedValueOnce(rejected).mockResolvedValueOnce(accepted)

      const result = await shopifyQuery<{ shop: { id: string } }>('query { shop { id } }')

      expect(result).toEqual({ shop: { id: 'gid://shopify/Shop/1' } })
      expect(deleteShopSessions).toHaveBeenCalledExactlyOnceWith('test.myshopify.com')
      expect(fetch).toHaveBeenCalledTimes(2)
      expect((vi.mocked(fetch).mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'X-Shopify-Access-Token': 'revoked-token' })
      expect((vi.mocked(fetch).mock.calls[1][1] as RequestInit).headers).toMatchObject({ 'X-Shopify-Access-Token': 'fresh-token' })
    })

    it('stops after one retry: a second 401 is an error and the session is dropped only once', async () => {
      vi.mocked(getAccessToken).mockResolvedValueOnce('revoked-token').mockResolvedValueOnce('also-rejected')
      vi.mocked(fetch).mockResolvedValue(rejected)

      await expect(shopifyQuery('query { shop { id } }')).rejects.toThrow(/HTTP 401/)

      expect(fetch).toHaveBeenCalledTimes(2)
      expect(deleteShopSessions).toHaveBeenCalledTimes(1)
    })

    it('passes along the error when no fresh token can be obtained after the drop', async () => {
      vi.mocked(getAccessToken).mockResolvedValueOnce('revoked-token').mockRejectedValueOnce(new Error('open the app from Shopify admin'))
      vi.mocked(fetch).mockResolvedValueOnce(rejected)

      await expect(shopifyQuery('query { shop { id } }')).rejects.toThrow('open the app from Shopify admin')
      expect(fetch).toHaveBeenCalledTimes(1)
    })
  })

  it('keeps the stored session for other errors (a 500 says nothing about the token)', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500, json: async () => ({ errors: 'boom' }) } as unknown as Response)

    await expect(shopifyQuery('query { shop { id } }')).rejects.toThrow(/HTTP 500/)

    expect(deleteShopSessions).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
