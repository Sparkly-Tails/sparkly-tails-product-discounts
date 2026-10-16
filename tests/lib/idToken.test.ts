import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyIdToken } from '@/lib/idToken'

const SECRET = 'client-secret'
const API_KEY = 'client-id'
const SHOP = 'demo.myshopify.com'
const NOW = 1_800_000_000

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

function signToken(payload: Record<string, unknown>, secret = SECRET, header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' }): string {
  const head = b64url(JSON.stringify(header))
  const body = b64url(JSON.stringify(payload))
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}

const claims = (over: Record<string, unknown> = {}) => ({
  iss: `https://${SHOP}/admin`, dest: `https://${SHOP}`, aud: API_KEY, sub: '1', exp: NOW + 60, nbf: NOW - 5, iat: NOW - 5, jti: 'j', sid: 's', ...over,
})
const opts = { secret: SECRET, apiKey: API_KEY, shop: SHOP, now: NOW }

describe('verifyIdToken', () => {
  it('accepts a correctly signed token for this app and shop', async () => {
    const result = await verifyIdToken(signToken(claims()), opts)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.shop).toBe(SHOP)
  })

  it('rejects a token signed with a different secret', async () => {
    expect(await verifyIdToken(signToken(claims(), 'other-secret'), opts)).toEqual({ ok: false, reason: 'signature' })
  })

  it('rejects a tampered payload', async () => {
    const [h, , s] = signToken(claims()).split('.')
    const forged = `${h}.${b64url(JSON.stringify(claims({ dest: 'https://evil.myshopify.com' })))}.${s}`
    expect(await verifyIdToken(forged, opts)).toEqual({ ok: false, reason: 'signature' })
  })

  it('rejects anything that is not a three-part JWT, or not HS256', async () => {
    expect(await verifyIdToken('not-a-token', opts)).toEqual({ ok: false, reason: 'malformed' })
    expect(await verifyIdToken('a.b', opts)).toEqual({ ok: false, reason: 'malformed' })
    expect(await verifyIdToken(signToken(claims(), SECRET, { alg: 'none' }), opts)).toEqual({ ok: false, reason: 'malformed' })
    expect(await verifyIdToken(`${b64url('{"alg":"HS256"}')}.${b64url('{}')}.@@@`, opts)).toEqual({ ok: false, reason: 'malformed' })
  })

  it('rejects an expired token, allowing a few seconds of clock skew', async () => {
    expect(await verifyIdToken(signToken(claims({ exp: NOW - 11 })), opts)).toEqual({ ok: false, reason: 'expired' })
    expect((await verifyIdToken(signToken(claims({ exp: NOW - 5 })), opts)).ok).toBe(true)
  })

  it('rejects a token that is not valid yet', async () => {
    expect(await verifyIdToken(signToken(claims({ nbf: NOW + 11 })), opts)).toEqual({ ok: false, reason: 'not-yet-valid' })
  })

  it('rejects a token meant for another app', async () => {
    expect(await verifyIdToken(signToken(claims({ aud: 'someone-else' })), opts)).toEqual({ ok: false, reason: 'audience' })
  })

  it('rejects a token for another shop, even when it is correctly signed', async () => {
    expect(await verifyIdToken(signToken(claims({ dest: 'https://other.myshopify.com' })), opts)).toEqual({ ok: false, reason: 'shop' })
  })

  it('never accepts a token when the secret is empty', async () => {
    expect(await verifyIdToken(signToken(claims(), ''), { ...opts, secret: '' })).toEqual({ ok: false, reason: 'signature' })
  })

  it('rejects claims whose exp or nbf are not numbers', async () => {
    expect(await verifyIdToken(signToken(claims({ exp: 'soon' })), opts)).toEqual({ ok: false, reason: 'malformed' })
  })
})
