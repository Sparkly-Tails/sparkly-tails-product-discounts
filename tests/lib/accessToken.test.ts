import { describe, it, expect, vi } from 'vitest'
import { resolveAccessToken, NOT_AUTHENTICATED_MESSAGE } from '@/lib/accessToken'

const NOW = Date.UTC(2026, 9, 15, 12, 0, 0)
const at = (ms: number) => new Date(NOW + ms)
type S = { accessToken: string; expires: Date | null; refreshToken: string | null; refreshTokenExpires: Date | null }
const fresh = (token = 'fresh'): S => ({ accessToken: token, expires: at(3_600_000), refreshToken: `${token}-rt`, refreshTokenExpires: at(86_400_000) })
const expiredWithRefresh = (): S => ({ accessToken: 'old', expires: at(-1000), refreshToken: 'old-rt', refreshTokenExpires: at(86_400_000) })

function deps(over: Partial<Parameters<typeof resolveAccessToken<S>>[0]> = {}) {
  return {
    shop: 'demo.myshopify.com',
    idToken: null as string | null,
    now: () => NOW,
    loadSession: vi.fn(async (): Promise<S | undefined> => undefined),
    exchange: vi.fn(async (): Promise<S> => fresh('exchanged')),
    refresh: vi.fn(async (): Promise<S> => fresh('refreshed')),
    store: vi.fn(async () => {}),
    ...over,
  }
}

describe('resolveAccessToken', () => {
  it('uses a valid stored token without calling Shopify or writing', async () => {
    const d = deps({ loadSession: vi.fn(async () => fresh('stored')) })
    expect(await resolveAccessToken(d)).toBe('stored')
    expect(d.exchange).not.toHaveBeenCalled()
    expect(d.refresh).not.toHaveBeenCalled()
    expect(d.store).not.toHaveBeenCalled()
  })

  it('refreshes an expired token and stores the rotated pair', async () => {
    const d = deps({ loadSession: vi.fn(async () => expiredWithRefresh()) })
    expect(await resolveAccessToken(d)).toBe('refreshed')
    expect(d.refresh).toHaveBeenCalledWith('old-rt')
    expect(d.store).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'refreshed' }))
  })

  it('exchanges the ID token when there is no session, and stores the result', async () => {
    const d = deps({ idToken: 'jwt' })
    expect(await resolveAccessToken(d)).toBe('exchanged')
    expect(d.exchange).toHaveBeenCalledWith('jwt')
    expect(d.store).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'exchanged' }))
  })

  it('throws a clear error when there is no usable session and no ID token', async () => {
    await expect(resolveAccessToken(deps())).rejects.toThrow(NOT_AUTHENTICATED_MESSAGE)
  })

  it('when a refresh fails because another request rotated the pair first, uses the pair that request stored', async () => {
    const load = vi.fn<() => Promise<S | undefined>>()
    load.mockResolvedValueOnce(expiredWithRefresh()).mockResolvedValueOnce(fresh('stored-by-other'))
    const d = deps({ loadSession: load, refresh: vi.fn(async () => { throw new Error('invalid_grant') }) })
    expect(await resolveAccessToken(d)).toBe('stored-by-other')
    expect(d.exchange).not.toHaveBeenCalled()
  })

  it('when a refresh fails and nothing usable was stored, falls back to the ID token exchange', async () => {
    const d = deps({
      idToken: 'jwt',
      loadSession: vi.fn(async () => expiredWithRefresh()),
      refresh: vi.fn(async () => { throw new Error('invalid_grant') }),
    })
    expect(await resolveAccessToken(d)).toBe('exchanged')
    expect(d.exchange).toHaveBeenCalledWith('jwt')
  })

  it('when a refresh fails, nothing usable was stored and there is no ID token, rethrows the refresh error', async () => {
    const d = deps({
      loadSession: vi.fn(async () => expiredWithRefresh()),
      refresh: vi.fn(async () => { throw new Error('invalid_grant') }),
    })
    await expect(resolveAccessToken(d)).rejects.toThrow('invalid_grant')
  })
})
