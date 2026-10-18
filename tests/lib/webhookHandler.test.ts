import { describe, it, expect, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { handleWebhook, shopFromBody, complianceAction } from '@/lib/webhookHandler'

const SECRET = 'client-secret'
const UNINSTALLED_BODY = '{"id":1,"myshopify_domain":"demo.myshopify.com"}'
const sign = (raw: string, secret = SECRET) => createHmac('sha256', secret).update(raw, 'utf8').digest('base64')

function webhookRequest(body: string, headers: Record<string, string> = {}, signature = sign(body)) {
  return new Request('https://app.test/webhooks/x', {
    method: 'POST',
    body,
    headers: { 'x-shopify-hmac-sha256': signature, 'x-shopify-shop-domain': 'demo.myshopify.com', 'x-shopify-topic': 'app/uninstalled', ...headers },
  })
}

describe('handleWebhook', () => {
  it('runs the handler with the body shop for a correctly signed webhook and answers 200', async () => {
    const onVerified = vi.fn(async () => {})
    const res = await handleWebhook(webhookRequest(UNINSTALLED_BODY), { secret: SECRET, onVerified })
    expect(res.status).toBe(200)
    expect(onVerified).toHaveBeenCalledWith({ shop: 'demo.myshopify.com', topic: 'app/uninstalled', body: UNINSTALLED_BODY })
  })

  it('answers 400 and does nothing when the header names another shop than the signed body', async () => {
    const onVerified = vi.fn(async () => {})
    const res = await handleWebhook(webhookRequest(UNINSTALLED_BODY, { 'x-shopify-shop-domain': 'other.myshopify.com' }), { secret: SECRET, onVerified })
    expect(res.status).toBe(400)
    expect(onVerified).not.toHaveBeenCalled()
  })

  it('answers 400 and does nothing when a destructive topic body has no shop', async () => {
    const onVerified = vi.fn(async () => {})
    const res = await handleWebhook(webhookRequest('{"a":1}'), { secret: SECRET, onVerified })
    expect(res.status).toBe(400)
    expect(onVerified).not.toHaveBeenCalled()
  })

  it('does not log the body when it refuses a delivery', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await handleWebhook(webhookRequest('{"email":"customer@example.com"}'), { secret: SECRET, onVerified: async () => {} })
    expect(log.mock.calls.flat().join(' ')).not.toContain('customer@example.com')
    log.mockRestore()
  })

  it('answers 401 and does nothing for a tampered body', async () => {
    const onVerified = vi.fn(async () => {})
    const res = await handleWebhook(webhookRequest('{"a":2}', {}, sign('{"a":1}')), { secret: SECRET, onVerified })
    expect(res.status).toBe(401)
    expect(onVerified).not.toHaveBeenCalled()
  })

  it('answers 401 when the signature header is missing', async () => {
    const onVerified = vi.fn(async () => {})
    const req = new Request('https://app.test/webhooks/x', { method: 'POST', body: '{}', headers: { 'x-shopify-shop-domain': 'd.myshopify.com', 'x-shopify-topic': 't' } })
    expect((await handleWebhook(req, { secret: SECRET, onVerified })).status).toBe(401)
    expect(onVerified).not.toHaveBeenCalled()
  })

  it('answers 503 and does nothing when the client secret is not set', async () => {
    const onVerified = vi.fn(async () => {})
    expect((await handleWebhook(webhookRequest('{}'), { secret: undefined, onVerified })).status).toBe(503)
    expect((await handleWebhook(webhookRequest('{}'), { secret: '', onVerified })).status).toBe(503)
    expect(onVerified).not.toHaveBeenCalled()
  })

  it('answers 400 when the shop or topic header is missing on a correctly signed request', async () => {
    const onVerified = vi.fn(async () => {})
    const req = new Request('https://app.test/webhooks/x', { method: 'POST', body: '{}', headers: { 'x-shopify-hmac-sha256': sign('{}') } })
    expect((await handleWebhook(req, { secret: SECRET, onVerified })).status).toBe(400)
    expect(onVerified).not.toHaveBeenCalled()
  })

  it('answers 500 when the handler fails, so Shopify retries', async () => {
    const res = await handleWebhook(webhookRequest(UNINSTALLED_BODY), { secret: SECRET, onVerified: async () => { throw new Error('db down') } })
    expect(res.status).toBe(500)
  })
})

describe('shopFromBody', () => {
  const A = 'a.myshopify.com'
  const B = 'b.myshopify.com'

  it('returns the body shop when header and body agree', () => {
    expect(shopFromBody('app/uninstalled', `{"myshopify_domain":"${A}"}`, A)).toEqual({ ok: true, shop: A })
    expect(shopFromBody('shop/redact', `{"shop_domain":"${A}"}`, A)).toEqual({ ok: true, shop: A })
    expect(shopFromBody('SHOP_REDACT', `{"shop_domain":"${A}"}`, A)).toEqual({ ok: true, shop: A })
  })

  it('mismatch when the header names another shop', () => {
    expect(shopFromBody('app/uninstalled', `{"myshopify_domain":"${A}"}`, B)).toEqual({ ok: false, reason: 'mismatch' })
    expect(shopFromBody('shop/redact', `{"shop_domain":"${A}"}`, B)).toEqual({ ok: false, reason: 'mismatch' })
  })

  it('no-shop when the destructive topic body has no shop field, or it is not a shop host', () => {
    for (const body of ['{}', 'not json', '[]', 'null', '{"myshopify_domain":null}', '{"myshopify_domain":5}', '{"myshopify_domain":"evil.example.com"}', '{"shop_domain":"a.myshopify.com"}']) {
      expect(shopFromBody('app/uninstalled', body, A), body).toEqual({ ok: false, reason: 'no-shop' })
    }
    expect(shopFromBody('shop/redact', '{"myshopify_domain":"a.myshopify.com"}', A)).toEqual({ ok: false, reason: 'no-shop' })
  })

  it('header shop must pass isShopHost', () => {
    for (const header of ['', 'evil.myshopify.com.attacker.com', 'shop.myshopify.com:8080', 'myshopify.com']) {
      expect(shopFromBody('app/uninstalled', `{"myshopify_domain":"${header}"}`, header), header).toEqual({ ok: false, reason: 'no-shop' })
      expect(shopFromBody('app/scopes_update', '{}', header), header).toEqual({ ok: false, reason: 'no-shop' })
    }
  })

  it('topics that are not destructive take the validated header shop and ignore the body', () => {
    expect(shopFromBody('app/scopes_update', '{"shop_id":1,"current":["x"]}', A)).toEqual({ ok: true, shop: A })
    expect(shopFromBody('customers/redact', 'not json', A)).toEqual({ ok: true, shop: A })
    expect(shopFromBody('customers/data_request', '{"shop_domain":"b.myshopify.com"}', A)).toEqual({ ok: true, shop: A })
  })
})

describe('complianceAction', () => {
  it('acknowledges the customer topics, deletes sessions for shop/redact, ignores the rest', () => {
    expect(complianceAction('customers/data_request')).toBe('acknowledge')
    expect(complianceAction('customers/redact')).toBe('acknowledge')
    expect(complianceAction('shop/redact')).toBe('delete-sessions')
    expect(complianceAction('SHOP_REDACT')).toBe('delete-sessions')
    expect(complianceAction('CUSTOMERS_DATA_REQUEST')).toBe('acknowledge')
    expect(complianceAction('orders/create')).toBe('ignore')
  })
})
