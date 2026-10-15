import { getAccessToken } from '@/lib/getAccessToken'

const SHOPIFY_API_VERSION = '2025-10'

function apiUrl(): string {
  const shop = process.env.SHOPIFY_SHOP
  if (!shop) throw new Error('SHOPIFY_SHOP is not set')
  return `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`
}

export async function shopifyQuery<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const url = apiUrl()
  const token = await getAccessToken()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  })

  let json: { data?: T; errors?: unknown }
  try {
    json = await res.json()
  } catch (err) {
    throw new Error(
      `Shopify API returned a non-JSON response (HTTP ${res.status} ${res.statusText}): ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!res.ok) {
    throw new Error(`Shopify API error (HTTP ${res.status}): ${JSON.stringify(json)}`)
  }

  if (json.errors) {
    throw new Error(
      Array.isArray(json.errors)
        ? json.errors.map((e: { message: string }) => e.message).join('; ')
        : JSON.stringify(json.errors),
    )
  }
  return json.data as T
}
