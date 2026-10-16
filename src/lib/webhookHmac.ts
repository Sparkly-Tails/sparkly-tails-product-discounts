// Web Crypto only.

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null
  try {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

/** Checks `X-Shopify-Hmac-Sha256`: base64 HMAC-SHA256 of the raw body with the client secret. An empty secret never validates. */
export async function verifyWebhookHmac(rawBody: string, header: string | null, secret: string): Promise<boolean> {
  if (!secret || !header) return false
  const signature = base64ToBytes(header)
  if (!signature) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  return crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(rawBody))
}
