import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'node:crypto'
import { POST as uninstalled } from '@/app/webhooks/app/uninstalled/route'
import { POST as scopesUpdate } from '@/app/webhooks/app/scopes_update/route'
import { POST as compliance } from '@/app/webhooks/compliance/route'
import { deleteShopSessions, updateStoredScope } from '@/lib/sessions'

vi.mock('@/lib/sessions', () => ({ deleteShopSessions: vi.fn(async () => {}), updateStoredScope: vi.fn(async () => {}) }))

const SECRET = 'client-secret'
const sign = (raw: string) => createHmac('sha256', SECRET).update(raw, 'utf8').digest('base64')
const post = (body: string, topic: string, signature = sign(body)) =>
  new Request('https://app.test/webhooks', {
    method: 'POST', body,
    headers: { 'x-shopify-hmac-sha256': signature, 'x-shopify-shop-domain': 'demo.myshopify.com', 'x-shopify-topic': topic },
  })

beforeEach(() => {
  process.env.SHOPIFY_API_SECRET_KEY = SECRET
  vi.mocked(deleteShopSessions).mockClear()
  vi.mocked(updateStoredScope).mockClear()
})

describe('app/uninstalled', () => {
  it('deletes the shop sessions', async () => {
    expect((await uninstalled(post('{}', 'app/uninstalled'))).status).toBe(200)
    expect(deleteShopSessions).toHaveBeenCalledWith('demo.myshopify.com')
  })

  it('does nothing for a bad signature', async () => {
    expect((await uninstalled(post('{}', 'app/uninstalled', 'AAAA'))).status).toBe(401)
    expect(deleteShopSessions).not.toHaveBeenCalled()
  })
})

describe('app/scopes_update', () => {
  it('stores the current scopes', async () => {
    const body = '{"current":["read_products","write_products"]}'
    expect((await scopesUpdate(post(body, 'app/scopes_update'))).status).toBe(200)
    expect(updateStoredScope).toHaveBeenCalledWith('demo.myshopify.com', ['read_products', 'write_products'])
  })

  it('answers 200 without writing when the payload has no scopes', async () => {
    expect((await scopesUpdate(post('{}', 'app/scopes_update'))).status).toBe(200)
    expect(updateStoredScope).not.toHaveBeenCalled()
  })
})

describe('compliance', () => {
  it('acknowledges customers/data_request and customers/redact without touching the database', async () => {
    expect((await compliance(post('{"customer":{"email":"a@b.c"}}', 'customers/data_request'))).status).toBe(200)
    expect((await compliance(post('{}', 'customers/redact'))).status).toBe(200)
    expect(deleteShopSessions).not.toHaveBeenCalled()
  })

  it('deletes the shop sessions for shop/redact', async () => {
    expect((await compliance(post('{}', 'shop/redact'))).status).toBe(200)
    expect(deleteShopSessions).toHaveBeenCalledWith('demo.myshopify.com')
  })

  it('rejects a bad signature without touching the database', async () => {
    expect((await compliance(post('{}', 'shop/redact', 'AAAA'))).status).toBe(401)
    expect(deleteShopSessions).not.toHaveBeenCalled()
  })
})
