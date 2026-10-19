import { headers } from 'next/headers'
import { RequestedTokenType, type Session } from '@shopify/shopify-api'
import { resolveAccessToken } from '@/lib/accessToken'
import { getRequestShop } from '@/lib/requestShop'
import { getSessionStorage, getShopify } from '@/lib/shopifyApp'

/** The library types `accessToken` as optional; a session without one is no use here. */
type TokenSession = Session & { accessToken: string }

function withToken(session: Session | undefined): TokenSession | undefined {
  return session?.accessToken ? (session as TokenSession) : undefined
}

function requireToken(session: Session): TokenSession {
  const withTokenSession = withToken(session)
  if (!withTokenSession) throw new Error('Shopify returned a session without an access token')
  return withTokenSession
}

/** The ID token the proxy verified and forwarded; null outside a request (a script, a test). */
async function currentIdToken(): Promise<string | null> {
  try {
    return (await headers()).get('x-shopify-id-token')
  } catch {
    return null
  }
}

/** Server only. The access token for the request's shop (or `explicitShop`), from the stored session, a refresh or a token exchange. */
export async function getAccessToken(explicitShop?: string): Promise<string> {
  const shop = await getRequestShop(explicitShop)

  const shopify = getShopify()
  const storage = getSessionStorage()

  return resolveAccessToken<TokenSession>({
    shop,
    idToken: await currentIdToken(),
    now: () => Date.now(),
    loadSession: async (forShop) => withToken(await storage.loadSession(shopify.session.getOfflineId(forShop))),
    exchange: async (idToken) =>
      requireToken(
        (await shopify.auth.tokenExchange({ shop, sessionToken: idToken, requestedTokenType: RequestedTokenType.OfflineAccessToken, expiring: true })).session,
      ),
    refresh: async (refreshToken) => requireToken((await shopify.auth.refreshToken({ shop, refreshToken })).session),
    store: async (session) => {
      await storage.storeSession(session)
    },
  })
}
