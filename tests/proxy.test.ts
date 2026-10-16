import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'
import { decideProxy, type ProxyDecision } from '@/lib/proxyDecision'

vi.mock('@/lib/proxyDecision', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/proxyDecision')>()),
  decideProxy: vi.fn(),
}))

const SHOP = 'demo.myshopify.com'
const API_KEY = 'client-id'

function request(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { headers })
}

function decide(decision: ProxyDecision): void {
  vi.mocked(decideProxy).mockResolvedValue(decision)
}

describe('proxy', () => {
  let log: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    process.env.SHOPIFY_SHOP = SHOP
    process.env.NEXT_PUBLIC_SHOPIFY_API_KEY = API_KEY
    process.env.SHOPIFY_API_SECRET_KEY = 'secret'
    vi.mocked(decideProxy).mockReset()
    log = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    log.mockRestore()
  })

  it('answers a bounce with the App Bridge page that fetches a fresh ID token', async () => {
    decide({ kind: 'bounce', reason: 'no-token' })

    const res = await proxy(request('https://app.test/?shop=a&host=b', { 'sec-fetch-dest': 'iframe' }))

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/html')
    const html = await res.text()
    expect(html).toContain(`name="shopify-api-key" content="${API_KEY}"`)
    expect(html).toContain('shopify.idToken()')
  })

  it('answers a missing configuration with 503 JSON', async () => {
    decide({ kind: 'deny', status: 503, message: 'App misconfigured: missing env vars', reason: 'missing-env' })

    const res = await proxy(request('https://app.test/', { accept: 'text/html' }))

    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'App misconfigured: missing env vars' })
  })

  it('answers a refused page load with an HTML page that links back to the Shopify admin', async () => {
    decide({ kind: 'deny', status: 403, message: 'Open this app from your Shopify admin.', reason: 'no-token' })

    const res = await proxy(request('https://app.test/', { accept: 'text/html' }))

    expect(res.status).toBe(403)
    expect(res.headers.get('content-type')).toBe('text/html')
    const html = await res.text()
    expect(html).toContain('Open this app from your Shopify admin.')
    expect(html).toContain(`https://${SHOP}/admin/apps`)
  })

  it('answers a refused fetch with JSON', async () => {
    decide({ kind: 'deny', status: 401, message: 'Unauthorized', reason: 'token-expired' })

    const res = await proxy(request('https://app.test/', { accept: '*/*' }))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('passes a verified request on with the verified token and shop headers set', async () => {
    decide({ kind: 'next-with-token', idToken: 'verified-jwt', shop: SHOP })

    const res = await proxy(request('https://app.test/', { 'x-shopify-id-token': 'forged', 'x-shopify-shop': 'evil.myshopify.com' }))

    expect(res.status).toBe(200)
    expect(res.headers.get('x-middleware-request-x-shopify-id-token')).toBe('verified-jwt')
    expect(res.headers.get('x-middleware-request-x-shopify-shop')).toBe(SHOP)
  })

  it('drops forged token headers when the request passes without a token', async () => {
    decide({ kind: 'next' })

    const res = await proxy(request('https://app.test/webhooks/compliance', { 'x-shopify-id-token': 'forged', 'x-shopify-shop': 'evil.myshopify.com' }))

    expect(res.headers.get('x-middleware-request-x-shopify-id-token')).toBeNull()
    expect(res.headers.get('x-middleware-request-x-shopify-shop')).toBeNull()
    expect(res.headers.get('x-middleware-override-headers') ?? '').not.toContain('x-shopify-shop')
  })

  it('logs why a request was refused, never the token, a secret or the query string', async () => {
    decide({ kind: 'deny', status: 403, message: 'Open this app from your Shopify admin.', reason: 'token-signature' })

    await proxy(request('https://app.test/discounts?id_token=SECRET-JWT-VALUE&shop=a&host=b', { 'sec-fetch-dest': 'iframe', authorization: 'Bearer SECRET-BEARER-VALUE' }))

    expect(log).toHaveBeenCalledTimes(1)
    const line = String(log.mock.calls[0][0])
    expect(line).toContain('reason=token-signature')
    expect(line).toContain('status=403')
    expect(line).toContain('path=/discounts')
    expect(line).toContain('idTokenParam=true')
    expect(line).not.toContain('SECRET-JWT-VALUE')
    expect(line).not.toContain('SECRET-BEARER-VALUE')
    expect(line).not.toContain('secret')
  })

  it('stays quiet for requests that pass', async () => {
    decide({ kind: 'next' })

    await proxy(request('https://app.test/'))

    expect(log).not.toHaveBeenCalled()
  })
})
