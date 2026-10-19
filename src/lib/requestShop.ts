import { headers } from 'next/headers'
import { isShopHost } from '@/lib/idToken'

const NO_SHOP = 'No shop for this request'

/**
 * Server only. The store a request belongs to: the shop the proxy verified from the ID token and
 * forwarded as `x-shopify-shop`, or an explicit shop (a webhook's signed shop, a script). Nothing
 * else counts: never an environment variable, and a shop that is not a real shop host is refused.
 */
export async function getRequestShop(explicit?: string): Promise<string> {
  if (explicit !== undefined) {
    if (!isShopHost(explicit)) throw new Error(NO_SHOP)
    return explicit
  }
  let verified: string | null
  try {
    verified = (await headers()).get('x-shopify-shop')
  } catch {
    verified = null
  }
  if (!verified || !isShopHost(verified)) throw new Error(NO_SHOP)
  return verified
}
