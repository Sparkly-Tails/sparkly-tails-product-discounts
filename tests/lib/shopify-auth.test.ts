import { describe, it, expect } from 'vitest'
import { verifyShopifyHmac, makeSessionToken, verifyUrlToken } from '@/lib/shopify-auth'

describe('verifyShopifyHmac', () => {
  it('accepts a correctly signed set of params', async () => {
    const secret = 'test-secret'
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
    const message = 'shop=test.myshopify.com&timestamp=1700000000'
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
    const hmac = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')

    const params = new URLSearchParams({ shop: 'test.myshopify.com', timestamp: '1700000000', hmac })
    expect(await verifyShopifyHmac(params, secret)).toBe(true)
  })

  it('rejects a tampered param', async () => {
    const params = new URLSearchParams({ shop: 'evil.myshopify.com', timestamp: '1700000000', hmac: 'deadbeef' })
    expect(await verifyShopifyHmac(params, 'test-secret')).toBe(false)
  })

  it('rejects params with no hmac at all', async () => {
    const params = new URLSearchParams({ shop: 'test.myshopify.com' })
    expect(await verifyShopifyHmac(params, 'test-secret')).toBe(false)
  })
})

describe('makeSessionToken / verifyUrlToken', () => {
  it('round-trips a freshly minted token', async () => {
    const token = await makeSessionToken('test.myshopify.com', 'test-secret')
    expect(await verifyUrlToken(token, 'test-secret')).toBe(true)
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await makeSessionToken('test.myshopify.com', 'right-secret')
    expect(await verifyUrlToken(token, 'wrong-secret')).toBe(false)
  })

  it('rejects a malformed token', async () => {
    expect(await verifyUrlToken('not-a-real-token', 'test-secret')).toBe(false)
  })

  it('rejects a token with a non-numeric timestamp segment', async () => {
    expect(
      await verifyUrlToken('shop.example.com|not-a-number|somesignature', 'test-secret'),
    ).toBe(false)
  })

  it('rejects a token older than the 10-minute window', async () => {
    const shop = 'test.myshopify.com'
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw', enc.encode('secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    )
    const oldTs = (Date.now() - 11 * 60 * 1000).toString()
    const payload = `${shop}|${oldTs}`
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
    const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
    const staleToken = `${payload}|${hex}`
    expect(await verifyUrlToken(staleToken, 'secret')).toBe(false)
  })
})
