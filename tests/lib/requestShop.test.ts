import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { headers } from 'next/headers'
import { getRequestShop } from '@/lib/requestShop'

vi.mock('next/headers', () => ({ headers: vi.fn() }))

const SHOP = 'demo.myshopify.com'

function requestWithShopHeader(value: string | null): void {
  vi.mocked(headers).mockResolvedValue(new Headers(value === null ? {} : { 'x-shopify-shop': value }) as never)
}

describe('getRequestShop', () => {
  beforeEach(() => {
    vi.mocked(headers).mockReset()
  })

  afterEach(() => {
    delete process.env.SHOPIFY_SHOP
  })

  it('returns the verified header shop', async () => {
    requestWithShopHeader(SHOP)

    expect(await getRequestShop()).toBe(SHOP)
  })

  it('throws when there is no header and no explicit shop', async () => {
    requestWithShopHeader(null)

    await expect(getRequestShop()).rejects.toThrow('No shop for this request')
  })

  it('throws outside a request (a script, a static asset) when no shop is given', async () => {
    vi.mocked(headers).mockRejectedValue(new Error('headers() was called outside a request scope'))

    await expect(getRequestShop()).rejects.toThrow('No shop for this request')
  })

  it('refuses a header that is not a real shop host', async () => {
    requestWithShopHeader('evil.myshopify.com.attacker.com')

    await expect(getRequestShop()).rejects.toThrow('No shop for this request')
  })

  it('an explicit shop wins but must be a valid shop host', async () => {
    requestWithShopHeader(SHOP)

    expect(await getRequestShop('other.myshopify.com')).toBe('other.myshopify.com')
    await expect(getRequestShop('https://other.myshopify.com')).rejects.toThrow('No shop for this request')
    await expect(getRequestShop('')).rejects.toThrow('No shop for this request')
  })

  it('never reads process.env', async () => {
    process.env.SHOPIFY_SHOP = 'other.myshopify.com'
    requestWithShopHeader(null)

    await expect(getRequestShop()).rejects.toThrow('No shop for this request')
  })
})
