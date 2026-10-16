import { verifyIdToken } from '@/lib/idToken'
import { pickIdToken } from '@/lib/tokenSource'

export interface ProxyInput {
  pathname: string
  searchParams: URLSearchParams
  headers: { authorization: string | null; secFetchDest: string | null; accept: string | null; rsc: string | null }
  env: { secret: string | undefined; apiKey: string | undefined; shop: string | undefined }
  /** Unix time in seconds. */
  now: number
  isDevelopment: boolean
}

export type ProxyDecision =
  | { kind: 'next' }
  | { kind: 'next-with-token'; idToken: string; shop: string }
  | { kind: 'bounce' }
  | { kind: 'deny'; status: 401 | 403 | 503; message: string }

const EXEMPT_PREFIXES = ['/_next/', '/webhooks/']

export function isDocumentRequest(headers: { secFetchDest: string | null; accept: string | null; rsc: string | null }): boolean {
  if (headers.rsc === '1') return false
  if (headers.secFetchDest) return headers.secFetchDest === 'document'
  return !!headers.accept?.includes('text/html')
}

export async function decideProxy(input: ProxyInput): Promise<ProxyDecision> {
  const { pathname, searchParams, headers, env, now } = input

  if (EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || pathname === '/favicon.ico') return { kind: 'next' }
  if (input.isDevelopment) return { kind: 'next' }

  if (!env.secret || !env.apiKey || !env.shop) {
    return { kind: 'deny', status: 503, message: 'App misconfigured: missing env vars' }
  }

  const isDocument = isDocumentRequest(headers)
  const canBounce = isDocument && searchParams.has('shop') && searchParams.has('host') && searchParams.get('shopify-bounced') !== '1'
  const idToken = pickIdToken({ authorization: headers.authorization, idTokenParam: searchParams.get('id_token') })

  if (idToken) {
    const result = await verifyIdToken(idToken, { secret: env.secret, apiKey: env.apiKey, shop: env.shop, now })
    if (result.ok) return { kind: 'next-with-token', idToken, shop: result.shop }
    if (result.reason === 'shop') return { kind: 'deny', status: 403, message: 'This app is not set up for this store.' }
  }

  if (canBounce) return { kind: 'bounce' }
  if (isDocument) return { kind: 'deny', status: 403, message: 'Open this app from your Shopify admin.' }
  return { kind: 'deny', status: 401, message: 'Unauthorized' }
}

/** The request headers to pass on: any client-sent token headers are dropped, then the verified ones are set. */
export function forwardHeaders(inbound: Headers, decision: ProxyDecision): Headers {
  const out = new Headers(inbound)
  out.delete('x-shopify-id-token')
  out.delete('x-shopify-shop')
  if (decision.kind === 'next-with-token') {
    out.set('x-shopify-id-token', decision.idToken)
    out.set('x-shopify-shop', decision.shop)
  }
  return out
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** A page that gets a fresh ID token from App Bridge and reloads the same URL with it (once). */
export function bouncePage(apiKey: string): string {
  return `<!DOCTYPE html><html><head><meta name="shopify-api-key" content="${escapeAttribute(apiKey)}"><script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script></head><body><script>
shopify.idToken().then(function (token) {
  var url = new URL(window.location.href);
  url.searchParams.set('id_token', token);
  url.searchParams.set('shopify-bounced', '1');
  window.location.replace(url.toString());
});
</script></body></html>`
}
