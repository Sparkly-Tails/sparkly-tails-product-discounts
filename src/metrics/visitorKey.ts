// A visitor is counted without being known. The pixel's client id goes through a keyed hash together with the shop and the day,
// so the stored key cannot be turned back into the id and is different on every day and in every shop.

/** Keeps this use of the secret apart from any other use of it. */
const KEY_LABEL = 'visitor-key'
const HMAC_ALGORITHM = { name: 'HMAC', hash: 'SHA-256' }

export function formatHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** The platform pieces the hash needs, gathered once so the function itself reads nothing from outside. */
export const VISITOR_KEY_TOOLS = { subtle: globalThis.crypto.subtle, encoder: new TextEncoder(), BytesView: Uint8Array, formatHex }

export type VisitorKeyTools = typeof VISITOR_KEY_TOOLS

export async function buildVisitorKey({ clientId, shop, day, secret, tools }: { clientId: string; shop: string; day: string; secret: string; tools: VisitorKeyTools }): Promise<string> {
  const key = await tools.subtle.importKey('raw', tools.encoder.encode(secret), HMAC_ALGORITHM, false, ['sign'])
  const signature = await tools.subtle.sign('HMAC', key, tools.encoder.encode(`${KEY_LABEL}|${shop}|${day}|${clientId}`))
  return tools.formatHex(new tools.BytesView(signature))
}
