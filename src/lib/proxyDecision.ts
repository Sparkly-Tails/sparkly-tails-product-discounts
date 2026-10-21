import { verifyIdToken } from '@/lib/idToken'
import { pickIdToken } from '@/lib/tokenSource'

export interface ProxyInput {
  pathname: string
  searchParams: URLSearchParams
  headers: { authorization: string | null; secFetchDest: string | null; accept: string | null; rsc: string | null }
  env: { secret: string | undefined; apiKey: string | undefined }
  /** Unix time in seconds. */
  now: number
  isDevelopment: boolean
}

/**
 * Why a request was bounced or refused: a short code that is safe to log (it never
 * holds a token): `no-token`, `token-<reason from verifyIdToken>` or `missing-env`.
 */
export type ProxyDecision =
  | { kind: 'next' }
  | { kind: 'next-with-token'; idToken: string; shop: string }
  | { kind: 'bounce'; reason: string }
  | { kind: 'deny'; status: 401 | 403 | 503; message: string; reason: string }

const EXEMPT_PREFIXES = ['/_next/', '/webhooks/', '/assets/']

/** A page load: a navigation, or the iframe/frame the Shopify admin embeds the app in (browsers label that `iframe`). */
const PAGE_DESTINATIONS = ['document', 'iframe', 'frame']

export function isDocumentRequest(headers: { secFetchDest: string | null; accept: string | null; rsc: string | null }): boolean {
  if (headers.rsc === '1') return false
  if (headers.secFetchDest) return PAGE_DESTINATIONS.includes(headers.secFetchDest)
  return !!headers.accept?.includes('text/html')
}

export async function decideProxy(input: ProxyInput): Promise<ProxyDecision> {
  const { pathname, searchParams, headers, env, now } = input

  if (EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || pathname === '/favicon.ico') return { kind: 'next' }
  if (input.isDevelopment) return { kind: 'next' }

  if (!env.secret || !env.apiKey) {
    return { kind: 'deny', status: 503, message: 'App misconfigured: missing env vars', reason: 'missing-env' }
  }

  const isDocument = isDocumentRequest(headers)
  const canBounce = isDocument && searchParams.has('shop') && searchParams.has('host') && searchParams.get('shopify-bounced') !== '1'
  const idToken = pickIdToken({ authorization: headers.authorization, idTokenParam: searchParams.get('id_token') })

  let reason = 'no-token'
  if (idToken) {
    const result = await verifyIdToken(idToken, { secret: env.secret, apiKey: env.apiKey, now })
    if (result.ok) return { kind: 'next-with-token', idToken, shop: result.shop }
    reason = `token-${result.reason}`
    if (result.reason === 'shop') return { kind: 'deny', status: 403, message: 'This app is not set up for this store.', reason }
  }

  if (canBounce) return { kind: 'bounce', reason }
  if (isDocument) return { kind: 'deny', status: 403, message: 'Open this app from your Shopify admin.', reason }
  return { kind: 'deny', status: 401, message: 'Unauthorized', reason }
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
