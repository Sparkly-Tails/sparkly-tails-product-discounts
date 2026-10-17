import { describe, it, expect, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { handleWebhook, parseScopesPayload, complianceAction, bodyKeyNames } from '@/lib/webhookHandler'

const SECRET = 'client-secret'
const sign = (raw: string, secret = SECRET) => createHmac('sha256', secret).update(raw, 'utf8').digest('base64')

function webhookRequest(body: string, headers: Record<string, string> = {}, signature = sign(body)) {
  return new Request('https://app.test/webhooks/x', {
    method: 'POST',
    body,
    headers: { 'x-shopify-hmac-sha256': signature, 'x-shopify-shop-domain': 'demo.myshopify.com', 'x-shopify-topic': 'app/uninstalled', ...headers },
  })
}

describe('handleWebhook', () => {
  it('runs the handler for a correctly signed webhook and answers 200', async () => {
    const onVerified = vi.fn(async () => {})
    const res = await handleWebhook(webhookRequest('{"a":1}'), { secret: SECRET, onVerified })
    expect(res.status).toBe(200)
    expect(onVerified).toHaveBeenCalledWith({ shop: 'demo.myshopify.com', topic: 'app/uninstalled', body: '{"a":1}' })
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
    const res = await handleWebhook(webhookRequest('{}'), { secret: SECRET, onVerified: async () => { throw new Error('db down') } })
    expect(res.status).toBe(500)
  })
})

describe('parseScopesPayload', () => {
  it('reads the current scopes', () => {
    expect(parseScopesPayload('{"current":["read_products","write_products"]}')).toEqual(['read_products', 'write_products'])
  })

  it('returns null for anything else', () => {
    expect(parseScopesPayload('not json')).toBeNull()
    expect(parseScopesPayload('{}')).toBeNull()
    expect(parseScopesPayload('{"current":"read_products"}')).toBeNull()
    expect(parseScopesPayload('{"current":[1]}')).toBeNull()
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

describe('bodyKeyNames (temporary: shows which field carries the shop, never a value)', () => {
  it('lists the top-level key names of a JSON object body', () => {
    expect(bodyKeyNames('{"id":1,"shop_domain":"a.myshopify.com","nested":{"x":1}}')).toBe('id,shop_domain,nested')
  })

  it('says so when the body is not JSON or not an object', () => {
    expect(bodyKeyNames('not json')).toBe('not-json')
    expect(bodyKeyNames('[1,2]')).toBe('not-an-object')
  })

  it('handleWebhook logs the key names but never a value', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const body = '{"shop_domain":"secret-store.myshopify.com","email":"customer@example.com"}'
    await handleWebhook(webhookRequest(body), { secret: SECRET, onVerified: async () => {} })
    const logged = log.mock.calls.map((call) => call.join(' ')).join('\n')
    log.mockRestore()
    expect(logged).toContain('shop_domain,email')
    expect(logged).not.toContain('secret-store.myshopify.com')
    expect(logged).not.toContain('customer@example.com')
  })
})
