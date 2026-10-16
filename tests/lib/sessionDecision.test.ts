import { describe, it, expect } from 'vitest'
import { decideSessionAction, EXPIRY_MARGIN_MS } from '@/lib/sessionDecision'

const NOW = Date.UTC(2026, 9, 15, 12, 0, 0)
const later = (ms: number) => new Date(NOW + ms)
const session = (over: Partial<{ accessToken: string; expires: Date | null; refreshToken: string | null; refreshTokenExpires: Date | null }> = {}) => ({
  accessToken: 'shpat_x', expires: later(3_600_000), refreshToken: 'rt', refreshTokenExpires: later(86_400_000), ...over,
})

describe('decideSessionAction', () => {
  it('uses a stored token that has not expired', () => {
    expect(decideSessionAction({ session: session(), idToken: null, now: NOW })).toEqual({ kind: 'use' })
  })

  it('uses a token that never expires (no expiry stored)', () => {
    expect(decideSessionAction({ session: session({ expires: null }), idToken: null, now: NOW })).toEqual({ kind: 'use' })
  })

  it('treats a token inside the safety margin as expired', () => {
    const nearlyExpired = session({ expires: later(EXPIRY_MARGIN_MS - 1) })
    expect(decideSessionAction({ session: nearlyExpired, idToken: null, now: NOW })).toEqual({ kind: 'refresh' })
  })

  it('refreshes an expired token when the refresh token is still valid', () => {
    expect(decideSessionAction({ session: session({ expires: later(-1000) }), idToken: 'jwt', now: NOW })).toEqual({ kind: 'refresh' })
  })

  it('refreshes when the refresh token has no stored expiry', () => {
    expect(decideSessionAction({ session: session({ expires: later(-1000), refreshTokenExpires: null }), idToken: null, now: NOW })).toEqual({ kind: 'refresh' })
  })

  it('exchanges the ID token when the token and the refresh token are both expired', () => {
    const dead = session({ expires: later(-1000), refreshTokenExpires: later(-1000) })
    expect(decideSessionAction({ session: dead, idToken: 'jwt', now: NOW })).toEqual({ kind: 'exchange' })
  })

  it('exchanges the ID token when there is no refresh token', () => {
    expect(decideSessionAction({ session: session({ expires: later(-1000), refreshToken: null }), idToken: 'jwt', now: NOW })).toEqual({ kind: 'exchange' })
  })

  it('exchanges the ID token when there is no session at all', () => {
    expect(decideSessionAction({ session: undefined, idToken: 'jwt', now: NOW })).toEqual({ kind: 'exchange' })
  })

  it('gives up when there is no usable session and no ID token', () => {
    expect(decideSessionAction({ session: undefined, idToken: null, now: NOW })).toEqual({ kind: 'none' })
    expect(decideSessionAction({ session: session({ expires: later(-1000), refreshTokenExpires: later(-1000) }), idToken: null, now: NOW })).toEqual({ kind: 'none' })
  })
})
