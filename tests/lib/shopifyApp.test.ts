import { describe, it, expect, beforeEach } from 'vitest'
import { getShopify } from '@/lib/shopifyApp'

describe('getShopify', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SHOPIFY_API_KEY = 'test-key'
    process.env.SHOPIFY_API_SECRET_KEY = 'test-secret'
  })

  it('exposes token exchange, refresh and offline ids', () => {
    const shopify = getShopify()
    expect(typeof shopify.auth.tokenExchange).toBe('function')
    expect(typeof shopify.auth.refreshToken).toBe('function')
    expect(shopify.session.getOfflineId('demo.myshopify.com')).toBe('offline_demo.myshopify.com')
  })

  it('returns the same instance every time', () => {
    expect(getShopify()).toBe(getShopify())
  })
})
