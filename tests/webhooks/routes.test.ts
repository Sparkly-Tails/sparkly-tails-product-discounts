import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { POST as uninstalled } from '@/app/webhooks/app/uninstalled/route'
import { POST as scopesUpdate } from '@/app/webhooks/app/scopes_update/route'
import { POST as compliance } from '@/app/webhooks/compliance/route'
import { deleteShopSessions } from '@/lib/sessions'
import { refreshStoredScopes } from '@/lib/storedScopes'

vi.mock('@/lib/sessions', () => ({ deleteShopSessions: vi.fn(async () => {}), updateStoredScope: vi.fn(async () => {}) }))
vi.mock('@/lib/storedScopes', () => ({ refreshStoredScopes: vi.fn(async () => {}) }))

const SECRET = 'client-secret'
const A = 'demo.myshopify.com'
const B = 'other.myshopify.com'
const sign = (raw: string) => createHmac('sha256', SECRET).update(raw, 'utf8').digest('base64')
const post = (body: string, topic: string, signature = sign(body), shopHeader = A) =>
  new Request('https://app.test/webhooks', {
    method: 'POST', body,
    headers: { 'x-shopify-hmac-sha256': signature, 'x-shopify-shop-domain': shopHeader, 'x-shopify-topic': topic },
  })
const uninstalledBody = (shop: string) => JSON.stringify({ id: 1, myshopify_domain: shop })
const redactBody = (shop: string) => JSON.stringify({ shop_id: 1, shop_domain: shop })

beforeEach(() => {
  process.env.SHOPIFY_API_SECRET_KEY = SECRET
  vi.mocked(deleteShopSessions).mockClear()
  vi.mocked(refreshStoredScopes).mockClear()
})

describe('app/uninstalled', () => {
  it('deletes the sessions of the shop in the signed body', async () => {
    expect((await uninstalled(post(uninstalledBody(A), 'app/uninstalled'))).status).toBe(200)
    expect(deleteShopSessions).toHaveBeenCalledExactlyOnceWith(A)
  })

  it('uninstalled for A with a header for B deletes nothing and answers 400', async () => {
    expect((await uninstalled(post(uninstalledBody(A), 'app/uninstalled', undefined, B))).status).toBe(400)
    expect(deleteShopSessions).not.toHaveBeenCalled()
  })

  it('answers 400 and deletes nothing when the body has no shop', async () => {
    expect((await uninstalled(post('{}', 'app/uninstalled'))).status).toBe(400)
    expect(deleteShopSessions).not.toHaveBeenCalled()
  })

  it('does nothing for a bad signature', async () => {
    expect((await uninstalled(post(uninstalledBody(A), 'app/uninstalled', 'AAAA'))).status).toBe(401)
    expect(deleteShopSessions).not.toHaveBeenCalled()
  })
})

describe('app/scopes_update', () => {
  it('ignores the body scope list and refreshes from Shopify for the header shop', async () => {
    const body = '{"shop_id":1,"current":["read_products","write_everything"]}'
    expect((await scopesUpdate(post(body, 'app/scopes_update'))).status).toBe(200)
    expect(refreshStoredScopes).toHaveBeenCalledExactlyOnceWith(A)
  })

  it('answers 400 and refreshes nothing when the header is not a real shop host', async () => {
    expect((await scopesUpdate(post('{}', 'app/scopes_update', undefined, 'evil.example.com'))).status).toBe(400)
    expect(refreshStoredScopes).not.toHaveBeenCalled()
  })

  it('answers 500 so Shopify retries when the refresh fails', async () => {
    vi.mocked(refreshStoredScopes).mockRejectedValueOnce(new Error('open the app from Shopify admin'))
    expect((await scopesUpdate(post('{}', 'app/scopes_update'))).status).toBe(500)
  })
})

describe('compliance', () => {
  it('acknowledges customers/data_request and customers/redact without touching the database', async () => {
    expect((await compliance(post('{"customer":{"email":"a@b.c"}}', 'customers/data_request'))).status).toBe(200)
    expect((await compliance(post('{}', 'customers/redact'))).status).toBe(200)
    expect(deleteShopSessions).not.toHaveBeenCalled()
  })

  it('shop/redact deletes only the body shop', async () => {
    expect((await compliance(post(redactBody(A), 'shop/redact'))).status).toBe(200)
    expect(deleteShopSessions).toHaveBeenCalledExactlyOnceWith(A)
  })

  it('shop/redact for A with a header for B deletes nothing and answers 400', async () => {
    expect((await compliance(post(redactBody(A), 'shop/redact', undefined, B))).status).toBe(400)
    expect(deleteShopSessions).not.toHaveBeenCalled()
  })

  it('rejects a bad signature without touching the database', async () => {
    expect((await compliance(post(redactBody(A), 'shop/redact', 'AAAA'))).status).toBe(401)
    expect(deleteShopSessions).not.toHaveBeenCalled()
  })
})
