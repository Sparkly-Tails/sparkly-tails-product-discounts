import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { decideProxy, forwardHeaders, bouncePage, isDocumentRequest, type ProxyInput } from '@/lib/proxyDecision'

const SECRET = 'client-secret'
const API_KEY = 'client-id'
const SHOP = 'demo.myshopify.com'
const NOW = 1_800_000_000

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url')
function token(over: Record<string, unknown> = {}, secret = SECRET): string {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify({ iss: `https://${SHOP}/admin`, dest: `https://${SHOP}`, aud: API_KEY, sub: '1', exp: NOW + 60, nbf: NOW - 5, iat: NOW - 5, jti: 'j', sid: 's', ...over }))
  return `${head}.${body}.${createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`
}

const documentHeaders = { authorization: null, secFetchDest: 'document', accept: 'text/html', rsc: null }
const fetchHeaders = { authorization: null, secFetchDest: 'empty', accept: '*/*', rsc: null }

function input(over: Partial<ProxyInput> = {}): ProxyInput {
  return {
    pathname: '/', searchParams: new URLSearchParams(), headers: documentHeaders,
    env: { secret: SECRET, apiKey: API_KEY, shop: SHOP }, now: NOW, isDevelopment: false, ...over,
  }
}

describe('decideProxy', () => {
  it('lets static assets and webhooks through without a token', async () => {
    for (const pathname of ['/_next/static/x.js', '/favicon.ico', '/webhooks/app/uninstalled', '/webhooks/compliance']) {
      expect(await decideProxy(input({ pathname }))).toEqual({ kind: 'next' })
    }
  })

  it('lets everything through in development', async () => {
    expect(await decideProxy(input({ isDevelopment: true }))).toEqual({ kind: 'next' })
  })

  it('answers 503 when the app is not configured', async () => {
    expect(await decideProxy(input({ env: { secret: undefined, apiKey: API_KEY, shop: SHOP } }))).toMatchObject({ kind: 'deny', status: 503 })
    expect(await decideProxy(input({ env: { secret: SECRET, apiKey: API_KEY, shop: '' } }))).toMatchObject({ kind: 'deny', status: 503 })
  })

  it('accepts a valid ID token in the id_token query parameter on a page load', async () => {
    const t = token()
    expect(await decideProxy(input({ searchParams: new URLSearchParams({ id_token: t, shop: SHOP, host: 'h' }) }))).toEqual({ kind: 'next-with-token', idToken: t, shop: SHOP })
  })

  it('accepts a valid ID token in the Authorization header on a fetch', async () => {
    const t = token()
    expect(await decideProxy(input({ headers: { ...fetchHeaders, authorization: `Bearer ${t}` } }))).toEqual({ kind: 'next-with-token', idToken: t, shop: SHOP })
  })

  it('refuses a correctly signed token for another shop with 403', async () => {
    const t = token({ dest: 'https://other.myshopify.com' })
    expect(await decideProxy(input({ searchParams: new URLSearchParams({ id_token: t, shop: SHOP, host: 'h' }) }))).toMatchObject({ kind: 'deny', status: 403 })
  })

  it('bounces a page load whose token has expired, when shop and host are present', async () => {
    const t = token({ exp: NOW - 60 })
    expect(await decideProxy(input({ searchParams: new URLSearchParams({ id_token: t, shop: SHOP, host: 'h' }) }))).toMatchObject({ kind: 'bounce' })
  })

  it('bounces a page load with no token when shop and host are present', async () => {
    expect(await decideProxy(input({ searchParams: new URLSearchParams({ shop: SHOP, host: 'h' }) }))).toMatchObject({ kind: 'bounce' })
  })

  it('never bounces twice: a still-invalid token after a bounce is a 403', async () => {
    const t = token({ exp: NOW - 60 })
    const params = new URLSearchParams({ id_token: t, shop: SHOP, host: 'h', 'shopify-bounced': '1' })
    expect(await decideProxy(input({ searchParams: params }))).toMatchObject({ kind: 'deny', status: 403 })
  })

  it('answers 403 to a page load with no token and no shop and host', async () => {
    expect(await decideProxy(input())).toMatchObject({ kind: 'deny', status: 403 })
  })

  it('answers 401 to a fetch with a missing or bad token, never a bounce', async () => {
    expect(await decideProxy(input({ headers: fetchHeaders }))).toMatchObject({ kind: 'deny', status: 401 })
    expect(await decideProxy(input({ headers: { ...fetchHeaders, authorization: 'Bearer garbage' } }))).toMatchObject({ kind: 'deny', status: 401 })
  })

  it('refuses a token signed with the wrong secret', async () => {
    const t = token({}, 'other-secret')
    expect(await decideProxy(input({ headers: { ...fetchHeaders, authorization: `Bearer ${t}` } }))).toMatchObject({ kind: 'deny', status: 401 })
  })

  // The Shopify admin opens the app inside an iframe, so the browser labels the request
  // Sec-Fetch-Dest: iframe (not document). It must be handled like a page load.
  it('treats the admin iframe load like a page load: an expired token bounces instead of a 401', async () => {
    const t = token({ exp: NOW - 60 })
    const params = new URLSearchParams({ id_token: t, shop: SHOP, host: 'h', embedded: '1' })
    const iframeHeaders = { ...documentHeaders, secFetchDest: 'iframe' }
    expect(await decideProxy(input({ headers: iframeHeaders, searchParams: params }))).toMatchObject({ kind: 'bounce' })
  })

  it('accepts a valid token on the admin iframe load', async () => {
    const t = token()
    const params = new URLSearchParams({ id_token: t, shop: SHOP, host: 'h', embedded: '1' })
    expect(await decideProxy(input({ headers: { ...documentHeaders, secFetchDest: 'iframe' }, searchParams: params }))).toEqual({ kind: 'next-with-token', idToken: t, shop: SHOP })
  })

  it('says why a request was refused, without any token in the reason', async () => {
    const noToken = await decideProxy(input({ headers: fetchHeaders }))
    expect(noToken).toMatchObject({ kind: 'deny', reason: 'no-token' })

    const wrongSecret = await decideProxy(input({ headers: { ...fetchHeaders, authorization: `Bearer ${token({}, 'other-secret')}` } }))
    expect(wrongSecret).toMatchObject({ kind: 'deny', reason: 'token-signature' })

    const otherShop = await decideProxy(input({ headers: { ...fetchHeaders, authorization: `Bearer ${token({ dest: 'https://other.myshopify.com' })}` } }))
    expect(otherShop).toMatchObject({ kind: 'deny', status: 403, reason: 'token-shop' })

    const wrongAudience = await decideProxy(input({ headers: { ...fetchHeaders, authorization: `Bearer ${token({ aud: 'someone-else' })}` } }))
    expect(wrongAudience).toMatchObject({ kind: 'deny', reason: 'token-audience' })

    const misconfigured = await decideProxy(input({ env: { secret: undefined, apiKey: API_KEY, shop: SHOP } }))
    expect(misconfigured).toMatchObject({ kind: 'deny', status: 503, reason: 'missing-env' })

    for (const decision of [noToken, wrongSecret, otherShop, wrongAudience, misconfigured]) {
      expect(JSON.stringify(decision)).not.toContain('eyJ')
    }
  })

  it('says why a page load bounced', async () => {
    expect(await decideProxy(input({ searchParams: new URLSearchParams({ shop: SHOP, host: 'h' }) }))).toEqual({ kind: 'bounce', reason: 'no-token' })
    const expired = token({ exp: NOW - 60 })
    expect(await decideProxy(input({ searchParams: new URLSearchParams({ id_token: expired, shop: SHOP, host: 'h' }) }))).toEqual({ kind: 'bounce', reason: 'token-expired' })
  })
})

describe('isDocumentRequest', () => {
  it('is true for a navigation and false for fetches and RSC requests', () => {
    expect(isDocumentRequest({ secFetchDest: 'document', accept: 'text/html', rsc: null })).toBe(true)
    expect(isDocumentRequest({ secFetchDest: null, accept: 'text/html,application/xhtml+xml', rsc: null })).toBe(true)
    expect(isDocumentRequest({ secFetchDest: 'empty', accept: '*/*', rsc: null })).toBe(false)
    expect(isDocumentRequest({ secFetchDest: null, accept: 'text/x-component', rsc: '1' })).toBe(false)
  })

  it('is true for a page loaded in an iframe or frame (how the Shopify admin embeds the app)', () => {
    expect(isDocumentRequest({ secFetchDest: 'iframe', accept: 'text/html', rsc: null })).toBe(true)
    expect(isDocumentRequest({ secFetchDest: 'frame', accept: 'text/html', rsc: null })).toBe(true)
  })

  it('is false for other destinations such as scripts and images', () => {
    expect(isDocumentRequest({ secFetchDest: 'script', accept: '*/*', rsc: null })).toBe(false)
    expect(isDocumentRequest({ secFetchDest: 'image', accept: 'image/*', rsc: null })).toBe(false)
  })
})

describe('forwardHeaders', () => {
  it('removes any client-sent token headers and sets the verified ones', () => {
    const inbound = new Headers({ 'x-shopify-id-token': 'forged', 'x-shopify-shop': 'evil.myshopify.com', accept: 'text/html' })
    const out = forwardHeaders(inbound, { kind: 'next-with-token', idToken: 'real', shop: SHOP })
    expect(out.get('x-shopify-id-token')).toBe('real')
    expect(out.get('x-shopify-shop')).toBe(SHOP)
    expect(out.get('accept')).toBe('text/html')
  })

  it('removes client-sent token headers when the request passes without a token', () => {
    const inbound = new Headers({ 'x-shopify-id-token': 'forged', 'x-shopify-shop': 'evil.myshopify.com' })
    const out = forwardHeaders(inbound, { kind: 'next' })
    expect(out.get('x-shopify-id-token')).toBeNull()
    expect(out.get('x-shopify-shop')).toBeNull()
  })
})

describe('bouncePage', () => {
  it('loads App Bridge with the api key and reloads the page with a fresh id_token', () => {
    const html = bouncePage('client-id')
    expect(html).toContain('name="shopify-api-key" content="client-id"')
    expect(html).toContain('https://cdn.shopify.com/shopifycloud/app-bridge.js')
    expect(html).toContain('shopify.idToken()')
    expect(html).toContain("'id_token'")
    expect(html).toContain("'shopify-bounced', '1'")
  })

  it('escapes the api key so it cannot break out of the attribute', () => {
    expect(bouncePage('a"b<c')).toContain('content="a&quot;b&lt;c"')
  })
})
