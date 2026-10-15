export interface StoredSession {
  accessToken: string
  expires?: Date | null
  refreshToken?: string | null
  refreshTokenExpires?: Date | null
}

export type SessionAction = { kind: 'use' } | { kind: 'refresh' } | { kind: 'exchange' } | { kind: 'none' }

/** A token this close to its expiry is treated as already expired. */
export const EXPIRY_MARGIN_MS = 60_000

/** What to do for a request: use the stored token, refresh it, exchange the ID token, or give up. `now` is in milliseconds. */
export function decideSessionAction(input: { session: StoredSession | undefined; idToken: string | null; now: number }): SessionAction {
  const { session, idToken, now } = input

  if (session && (!session.expires || session.expires.getTime() - EXPIRY_MARGIN_MS > now)) return { kind: 'use' }

  const refreshable = !!session?.refreshToken && (!session.refreshTokenExpires || session.refreshTokenExpires.getTime() > now)
  if (refreshable) return { kind: 'refresh' }

  if (idToken) return { kind: 'exchange' }
  return { kind: 'none' }
}
