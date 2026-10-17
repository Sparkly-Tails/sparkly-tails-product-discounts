import { verifyWebhookHmac } from '@/lib/webhookHmac'

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

  const shop = request.headers.get('x-shopify-shop-domain')
  const topic = request.headers.get('x-shopify-topic')
  if (!shop || !topic) return new Response('Missing headers', { status: 400 })

  // Temporary: shows which body field names the shop. Key names only, never a value; revert after the multi-store proof.
  console.log(`Webhook ${topic} body keys: ${bodyKeyNames(body)}`)

  try {
    await options.onVerified({ shop, topic, body })
  } catch (error) {
    console.log(`Webhook ${topic} for ${shop} failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    return new Response('Webhook failed', { status: 500 })
  }
  return new Response(null, { status: 200 })
}

/** Temporary: the top-level key names of a webhook body (never the values), or why there are none. */
export function bodyKeyNames(body: string): string {
  try {
    const parsed: unknown = JSON.parse(body)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return 'not-an-object'
    return Object.keys(parsed).join(',')
  } catch {
    return 'not-json'
  }
}

/** The `current` scopes of an app/scopes_update payload, or null when the payload does not have them. */
export function parseScopesPayload(body: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(body)
    const current = (parsed as { current?: unknown } | null)?.current
    return Array.isArray(current) && current.every((scope) => typeof scope === 'string') ? (current as string[]) : null
  } catch {
    return null
  }
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
