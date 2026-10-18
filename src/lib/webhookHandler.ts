import { verifyWebhookHmac } from '@/lib/webhookHmac'
import { isShopHost } from '@/lib/idToken'

/**
 * The body field that names the shop, per destructive topic (real `app/uninstalled` delivery: the
 * shop resource; `shop/redact` per Shopify's docs). The signature covers the body but not the
 * `x-shopify-shop-domain` header, so these topics trust only the body, and the header must agree.
 */
const BODY_SHOP_FIELD: Record<string, string> = {
  APP_UNINSTALLED: 'myshopify_domain',
  SHOP_REDACT: 'shop_domain',
}

const normalizeTopic = (topic: string): string => topic.toUpperCase().replace(/\//g, '_')

function bodyShop(body: string, field: string): string | null {
  try {
    const value = (JSON.parse(body) as Record<string, unknown> | null)?.[field]
    return typeof value === 'string' && isShopHost(value) ? value : null
  } catch {
    return null
  }
}

export type ShopFromBody = { ok: true; shop: string } | { ok: false; reason: 'no-shop' | 'mismatch' }

/**
 * The shop a verified webhook is about. For app/uninstalled and shop/redact it is the shop in the
 * signed body, and a header that names another shop is refused. Other topics do nothing destructive
 * with the body, so they take the header shop once it is a real shop host.
 */
export function shopFromBody(topic: string, body: string, headerShop: string): ShopFromBody {
  if (!isShopHost(headerShop)) return { ok: false, reason: 'no-shop' }
  const field = BODY_SHOP_FIELD[normalizeTopic(topic)]
  if (!field) return { ok: true, shop: headerShop }
  const shop = bodyShop(body, field)
  if (!shop) return { ok: false, reason: 'no-shop' }
  return shop === headerShop ? { ok: true, shop } : { ok: false, reason: 'mismatch' }
}

export interface VerifiedWebhook {
  shop: string
  topic: string
  /** The raw body. Never log it: compliance payloads hold customer contact data. */
  body: string
}

export async function handleWebhook(
  request: Request,
  options: { secret: string | undefined; onVerified: (webhook: VerifiedWebhook) => Promise<void> },
): Promise<Response> {
  if (!options.secret) return new Response('App misconfigured', { status: 503 })

  const body = await request.text()
  const valid = await verifyWebhookHmac(body, request.headers.get('x-shopify-hmac-sha256'), options.secret)
  if (!valid) return new Response('Unauthorized', { status: 401 })

  const headerShop = request.headers.get('x-shopify-shop-domain')
  const topic = request.headers.get('x-shopify-topic')
  if (!headerShop || !topic) return new Response('Missing headers', { status: 400 })

  const resolved = shopFromBody(topic, body, headerShop)
  if (!resolved.ok) {
    console.log(`Webhook ${topic} refused: ${resolved.reason}`)
    return new Response('Shop not confirmed', { status: 400 })
  }
  const shop = resolved.shop

  try {
    await options.onVerified({ shop, topic, body })
  } catch (error) {
    console.log(`Webhook ${topic} for ${shop} failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    return new Response('Webhook failed', { status: 500 })
  }
  return new Response(null, { status: 200 })
}

/** This app stores no customer data, so only shop/redact has work to do. Topic casing differs between API styles. */
export function complianceAction(topic: string): 'acknowledge' | 'delete-sessions' | 'ignore' {
  switch (topic.toUpperCase().replace(/\//g, '_')) {
    case 'CUSTOMERS_DATA_REQUEST':
    case 'CUSTOMERS_REDACT':
      return 'acknowledge'
    case 'SHOP_REDACT':
      return 'delete-sessions'
    default:
      return 'ignore'
  }
}
