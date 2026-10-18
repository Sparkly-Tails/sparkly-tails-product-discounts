import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RequestedTokenType } from '@shopify/shopify-api'
import { headers } from 'next/headers'
import { getAccessToken } from '@/lib/getAccessToken'
import { NOT_AUTHENTICATED_MESSAGE } from '@/lib/accessToken'
import { getSessionStorage, getShopify } from '@/lib/shopifyApp'

vi.mock('next/headers', () => ({ headers: vi.fn() }))
vi.mock('@/lib/shopifyApp', () => ({ getShopify: vi.fn(), getSessionStorage: vi.fn() }))

const SHOP = 'demo.myshopify.com'
const tokenExchange = vi.fn()
const refreshToken = vi.fn()
const loadSession = vi.fn()
const storeSession = vi.fn()

const later = (ms: number) => new Date(Date.now() + ms)
const stored = (over: Record<string, unknown> = {}) => ({
  id: `offline_${SHOP}`, shop: SHOP, accessToken: 'stored-token', expires: later(3_600_000), refreshToken: 'stored-refresh', refreshTokenExpires: later(86_400_000), ...over,
})

function requestWithIdToken(idToken: string | null, shop: string | null = SHOP): void {
  const verified: Record<string, string> = {}
  if (idToken) verified['x-shopify-id-token'] = idToken
  if (shop) verified['x-shopify-shop'] = shop
  vi.mocked(headers).mockResolvedValue(new Headers(verified) as never)
}

describe('getAccessToken', () => {
  beforeEach(() => {
    for (const fn of [tokenExchange, refreshToken, loadSession, storeSession]) fn.mockReset()
    vi.mocked(getShopify).mockReturnValue({
      auth: { tokenExchange, refreshToken },
      session: { getOfflineId: (shop: string) => `offline_${shop}` },
    } as never)
    vi.mocked(getSessionStorage).mockReturnValue({ loadSession, storeSession } as never)
    requestWithIdToken('id-jwt')
  })

  it('looks the session up by the offline id of the request shop and uses an unexpired token as it is', async () => {
    loadSession.mockResolvedValue(stored())

    expect(await getAccessToken()).toBe('stored-token')

    expect(loadSession).toHaveBeenCalledWith(`offline_${SHOP}`)
    expect(tokenExchange).not.toHaveBeenCalled()
    expect(refreshToken).not.toHaveBeenCalled()
  })

  it('exchanges with the request shop and the ID token for an expiring offline token and stores the session', async () => {
    const exchanged = stored({ accessToken: 'exchanged-token' })
    loadSession.mockResolvedValue(undefined)
    tokenExchange.mockResolvedValue({ session: exchanged })

    expect(await getAccessToken()).toBe('exchanged-token')

    expect(tokenExchange).toHaveBeenCalledExactlyOnceWith({
      shop: SHOP,
      sessionToken: 'id-jwt',
      requestedTokenType: RequestedTokenType.OfflineAccessToken,
      expiring: true,
    })
    expect(storeSession).toHaveBeenCalledExactlyOnceWith(exchanged)
  })

  it('refreshes an expired token with its refresh token and stores the rotated session', async () => {
    const refreshed = stored({ accessToken: 'refreshed-token', refreshToken: 'rotated-refresh' })
    loadSession.mockResolvedValue(stored({ expires: later(-1000) }))
    refreshToken.mockResolvedValue({ session: refreshed })

    expect(await getAccessToken()).toBe('refreshed-token')

    expect(refreshToken).toHaveBeenCalledExactlyOnceWith({ shop: SHOP, refreshToken: 'stored-refresh' })
    expect(tokenExchange).not.toHaveBeenCalled()
    expect(storeSession).toHaveBeenCalledExactlyOnceWith(refreshed)
  })

  it('treats a stored session without an access token as no session', async () => {
    loadSession.mockResolvedValue(stored({ accessToken: undefined }))
    tokenExchange.mockResolvedValue({ session: stored({ accessToken: 'exchanged-token' }) })

    expect(await getAccessToken()).toBe('exchanged-token')
  })

  it('refuses a token exchange result that has no access token', async () => {
    loadSession.mockResolvedValue(undefined)
    tokenExchange.mockResolvedValue({ session: stored({ accessToken: undefined }) })

    await expect(getAccessToken()).rejects.toThrow('Shopify returned a session without an access token')
    expect(storeSession).not.toHaveBeenCalled()
  })

  it('asks to open the app from the Shopify admin when there is no session and no ID token', async () => {
    requestWithIdToken(null)
    loadSession.mockResolvedValue(undefined)

    await expect(getAccessToken()).rejects.toThrow(NOT_AUTHENTICATED_MESSAGE)
  })

  it('works outside a request (a script) when the shop is given: no ID token, so only a stored token can be used', async () => {
    vi.mocked(headers).mockRejectedValue(new Error('headers() was called outside a request scope'))
    loadSession.mockResolvedValue(stored())

    expect(await getAccessToken(SHOP)).toBe('stored-token')
  })

  it('throws when the request has no verified shop, and touches no session', async () => {
    requestWithIdToken('id-jwt', null)

    await expect(getAccessToken()).rejects.toThrow('No shop for this request')
    expect(loadSession).not.toHaveBeenCalled()
    expect(tokenExchange).not.toHaveBeenCalled()
  })

  it('uses the shop it is given, not the header shop', async () => {
    loadSession.mockResolvedValue(stored({ id: 'offline_other.myshopify.com', shop: 'other.myshopify.com' }))

    await getAccessToken('other.myshopify.com')

    expect(loadSession).toHaveBeenCalledWith('offline_other.myshopify.com')
  })
})
