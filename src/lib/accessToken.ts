import { decideSessionAction, type StoredSession } from '@/lib/sessionDecision'

export const NOT_AUTHENTICATED_MESSAGE = 'No Shopify session. Open this app from your Shopify admin.'

export interface AccessTokenDeps<S extends StoredSession> {
  shop: string
  /** The verified App Bridge ID token of this request, if there is one. */
  idToken: string | null
  now: () => number
  loadSession: (shop: string) => Promise<S | undefined>
  exchange: (idToken: string) => Promise<S>
  refresh: (refreshToken: string) => Promise<S>
  store: (session: S) => Promise<void>
}

/**
 * The access token for the shop: the stored one, a refreshed one, or one
 * exchanged from the request's ID token. A failed refresh may only mean another
 * request rotated the refresh token first, so the stored session is read once
 * more before falling back to the exchange.
 */
export async function resolveAccessToken<S extends StoredSession>(deps: AccessTokenDeps<S>): Promise<string> {
  const session = await deps.loadSession(deps.shop)
  const action = decideSessionAction({ session, idToken: deps.idToken, now: deps.now() })

  if (action.kind === 'use') return session!.accessToken

  if (action.kind === 'refresh') {
    try {
      const refreshed = await deps.refresh(session!.refreshToken!)
      await deps.store(refreshed)
      return refreshed.accessToken
    } catch (error) {
      const reloaded = await deps.loadSession(deps.shop)
      if (decideSessionAction({ session: reloaded, idToken: null, now: deps.now() }).kind === 'use') return reloaded!.accessToken
      if (!deps.idToken) throw error
      return exchangeAndStore(deps, deps.idToken)
    }
  }

  if (action.kind === 'exchange') return exchangeAndStore(deps, deps.idToken!)

  throw new Error(NOT_AUTHENTICATED_MESSAGE)
}

async function exchangeAndStore<S extends StoredSession>(deps: AccessTokenDeps<S>, idToken: string): Promise<string> {
  const exchanged = await deps.exchange(idToken)
  await deps.store(exchanged)
  return exchanged.accessToken
}
