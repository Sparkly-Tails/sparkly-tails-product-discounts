import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { probeStoredToken } from '@/lib/uninstallTokenProbe'
import { getAccessToken } from '@/lib/getAccessToken'

vi.mock('@/lib/getAccessToken', () => ({ getAccessToken: vi.fn() }))

const SHOP = 'demo.myshopify.com'
const TOKEN = 'shpat_super_secret_token_123'

describe('probeStoredToken', () => {
  let log: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.mocked(getAccessToken).mockReset()
    vi.stubGlobal('fetch', vi.fn())
    log = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    log.mockRestore()
  })

  const logged = () => log.mock.calls.flat().join(' ')

  it('asks Shopify one harmless question with the stored token and logs the HTTP status', async () => {
    vi.mocked(getAccessToken).mockResolvedValue(TOKEN)
    vi.mocked(fetch).mockResolvedValue({ status: 200 } as Response)

    await probeStoredToken(SHOP)

    expect(getAccessToken).toHaveBeenCalledExactlyOnceWith(SHOP)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toMatch(/^https:\/\/demo\.myshopify\.com\/admin\/api\/.+\/graphql\.json$/)
    expect((init as RequestInit).headers).toMatchObject({ 'X-Shopify-Access-Token': TOKEN })
    expect(JSON.parse(String((init as RequestInit).body)).query).toBe('query { shop { id } }')
    expect(logged()).toContain(SHOP)
    expect(logged()).toContain('HTTP 200')
  })

  it('logs a rejected token as HTTP 401', async () => {
    vi.mocked(getAccessToken).mockResolvedValue(TOKEN)
    vi.mocked(fetch).mockResolvedValue({ status: 401 } as Response)

    await probeStoredToken(SHOP)

    expect(logged()).toContain('HTTP 401')
  })

  it('logs that there is no usable session and asks Shopify nothing', async () => {
    vi.mocked(getAccessToken).mockRejectedValue(new Error('Open this app from your Shopify admin'))

    await probeStoredToken(SHOP)

    expect(fetch).not.toHaveBeenCalled()
    expect(logged()).toContain('no usable session')
  })

  it('never throws, even when the request itself fails', async () => {
    vi.mocked(getAccessToken).mockResolvedValue(TOKEN)
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))

    await expect(probeStoredToken(SHOP)).resolves.toBeUndefined()
    expect(logged()).toContain('request failed')
  })

  it('never logs the token', async () => {
    vi.mocked(getAccessToken).mockResolvedValue(TOKEN)
    vi.mocked(fetch).mockResolvedValue({ status: 200 } as Response)
    await probeStoredToken(SHOP)

    vi.mocked(fetch).mockRejectedValue(new Error(`failed with ${TOKEN}`))
    await probeStoredToken(SHOP)

    vi.mocked(getAccessToken).mockRejectedValue(new Error(`no session for ${TOKEN}`))
    await probeStoredToken(SHOP)

    expect(logged()).not.toContain(TOKEN)
  })
})
