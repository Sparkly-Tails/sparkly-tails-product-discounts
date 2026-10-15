// Web Crypto only: safe to import from the proxy.

export interface IdTokenClaims {
  iss: string
  dest: string
  aud: string
  sub: string
  exp: number
  nbf: number
  iat: number
  jti: string
  sid: string
}

export type IdTokenResult =
  | { ok: true; claims: IdTokenClaims; shop: string }
  | { ok: false; reason: 'malformed' | 'signature' | 'expired' | 'not-yet-valid' | 'audience' | 'shop' }

export interface IdTokenOptions {
  secret: string
  apiKey: string
  shop: string
  /** Unix time in seconds. */
  now: number
}

const CLOCK_SKEW_SECONDS = 10
const MALFORMED = { ok: false, reason: 'malformed' } as const

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  try {
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

function decodeJson(part: string): Record<string, unknown> | null {
  const bytes = base64UrlToBytes(part)
  if (!bytes) return null
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export async function verifyIdToken(token: string, options: IdTokenOptions): Promise<IdTokenResult> {
  const parts = token.split('.')
  if (parts.length !== 3) return MALFORMED
  const [headerPart, payloadPart, signaturePart] = parts

  const header = decodeJson(headerPart)
  const payload = decodeJson(payloadPart)
  const signature = base64UrlToBytes(signaturePart)
  if (!header || !payload || !signature || header.alg !== 'HS256') return MALFORMED

  // An empty key must never validate anything.
  if (!options.secret) return { ok: false, reason: 'signature' }
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(options.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const valid = await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(`${headerPart}.${payloadPart}`))
  if (!valid) return { ok: false, reason: 'signature' }

  if (typeof payload.exp !== 'number' || typeof payload.nbf !== 'number') return MALFORMED
  if (payload.exp + CLOCK_SKEW_SECONDS < options.now) return { ok: false, reason: 'expired' }
  if (payload.nbf - CLOCK_SKEW_SECONDS > options.now) return { ok: false, reason: 'not-yet-valid' }
  if (payload.aud !== options.apiKey) return { ok: false, reason: 'audience' }

  let destHost: string
  try {
    destHost = new URL(String(payload.dest)).host
  } catch {
    return MALFORMED
  }
  if (destHost !== options.shop) return { ok: false, reason: 'shop' }

  return { ok: true, claims: payload as unknown as IdTokenClaims, shop: destHost }
}
