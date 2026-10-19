import { getAccessToken } from '@/lib/getAccessToken'
import { deleteShopSessions } from '@/lib/sessions'
import { getRequestShop } from '@/lib/requestShop'

const SHOPIFY_API_VERSION = '2025-10'

function apiUrl(shop: string): string {
  return `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`
}

function postQuery(url: string, token: string, query: string, variables?: Record<string, unknown>): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  })
}

export async function shopifyQuery<T>(
  query: string,
  variables?: Record<string, unknown>,
  explicitShop?: string,
): Promise<T> {
  const shop = await getRequestShop(explicitShop)
  const url = apiUrl(shop)
  let res = await postQuery(url, await getAccessToken(shop), query, variables)

  // Shopify refused the stored token (revoked, for example after a late uninstall webhook): drop it so the
  // next token comes from the request's ID token, and retry once.
  if (res.status === 401) {
    await deleteShopSessions(shop)
    res = await postQuery(url, await getAccessToken(shop), query, variables)
  }

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
