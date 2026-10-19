import { shopifyQuery } from '@/lib/shopify-client'
import { updateStoredScope } from '@/lib/sessions'

/**
 * Re-reads the scopes Shopify granted to this app on `shop`, with that shop's own token, and stores
 * them on its sessions. Used for app/scopes_update, whose unsigned header picks the shop: the body's
 * scope list is never trusted, so a replayed delivery only causes a harmless refresh.
 */
export async function refreshStoredScopes(shop: string): Promise<void> {
  const data = await shopifyQuery<{ currentAppInstallation: { accessScopes: { handle: string }[] } }>(
    `query { currentAppInstallation { accessScopes { handle } } }`,
    undefined,
    shop,
  )
  await updateStoredScope(shop, data.currentAppInstallation.accessScopes.map((scope) => scope.handle))
}
