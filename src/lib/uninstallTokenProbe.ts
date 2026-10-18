import { getAccessToken } from '@/lib/getAccessToken'

/** Same version the rest of the app talks to (see shopify-client.ts). */
const API_VERSION = '2025-10'

/**
 * TEMPORARY EXPERIMENT (remove after reading the result): while the app/uninstalled webhook runs, does the
 * stored token still work? It asks Shopify the cheapest question (`shop { id }`) with the stored token and
 * logs only the HTTP status, never the token or any response. It never throws, so the webhook is unaffected.
 */
export async function probeStoredToken(shop: string): Promise<void> {
  let token: string
  try {
    token = await getAccessToken(shop)
  } catch {
    console.log(`Uninstall token probe for ${shop}: no usable session`)
    return
  }
  try {
    const response = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: 'query { shop { id } }' }),
    })
    console.log(`Uninstall token probe for ${shop}: shop query HTTP ${response.status}`)
  } catch {
    console.log(`Uninstall token probe for ${shop}: request failed`)
  }
}
