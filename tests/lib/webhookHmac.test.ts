import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyWebhookHmac } from '@/lib/webhookHmac'

const SECRET = 'client-secret'
const body = JSON.stringify({ shop_domain: 'demo.myshopify.com' })
const sign = (raw: string, secret = SECRET) => createHmac('sha256', secret).update(raw, 'utf8').digest('base64')

describe('verifyWebhookHmac', () => {
  it('accepts the correct signature', async () => {
    expect(await verifyWebhookHmac(body, sign(body), SECRET)).toBe(true)
  })

  it('rejects a tampered body', async () => {
    expect(await verifyWebhookHmac(body + ' ', sign(body), SECRET)).toBe(false)
  })

  it('rejects a signature made with another secret', async () => {
    expect(await verifyWebhookHmac(body, sign(body, 'other'), SECRET)).toBe(false)
  })

  it('rejects a missing, empty or non-base64 signature', async () => {
    expect(await verifyWebhookHmac(body, null, SECRET)).toBe(false)
    expect(await verifyWebhookHmac(body, '', SECRET)).toBe(false)
    expect(await verifyWebhookHmac(body, '***', SECRET)).toBe(false)
  })

  it('never accepts anything when the secret is empty', async () => {
    expect(await verifyWebhookHmac(body, sign(body, ''), '')).toBe(false)
  })
})
