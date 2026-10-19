import { describe, it, expect, vi, beforeEach } from 'vitest'
import { refreshStoredScopes } from '@/lib/storedScopes'
import { shopifyQuery } from '@/lib/shopify-client'
import { updateStoredScope } from '@/lib/sessions'

vi.mock('@/lib/shopify-client', () => ({ shopifyQuery: vi.fn() }))
vi.mock('@/lib/sessions', () => ({ updateStoredScope: vi.fn(async () => {}) }))

describe('refreshStoredScopes', () => {
  beforeEach(() => {
    vi.mocked(shopifyQuery).mockReset()
    vi.mocked(updateStoredScope).mockClear()
  })

  it("reads the shop's granted scopes from Shopify with that shop and stores them", async () => {
    vi.mocked(shopifyQuery).mockResolvedValue({ currentAppInstallation: { accessScopes: [{ handle: 'write_discounts' }, { handle: 'write_products' }] } })

    await refreshStoredScopes('a.myshopify.com')

    expect(shopifyQuery).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('currentAppInstallation'), undefined, 'a.myshopify.com')
    expect(updateStoredScope).toHaveBeenCalledExactlyOnceWith('a.myshopify.com', ['write_discounts', 'write_products'])
  })

  it('stores nothing when Shopify cannot be read', async () => {
    vi.mocked(shopifyQuery).mockRejectedValue(new Error('Shopify API error (HTTP 401)'))

    await expect(refreshStoredScopes('a.myshopify.com')).rejects.toThrow('HTTP 401')
    expect(updateStoredScope).not.toHaveBeenCalled()
  })
})
