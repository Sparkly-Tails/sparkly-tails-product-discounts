import { describe, it, expect } from 'vitest'
import { buildVisitorKey, VISITOR_KEY_TOOLS } from '@/metrics/visitorKey'

const BASE = { clientId: 'client-abc-123', shop: 'demo.myshopify.com', day: '2026-11-02', secret: 'api-secret', tools: VISITOR_KEY_TOOLS }

describe('buildVisitorKey', () => {
  it('gives the same key for the same visitor, shop and day', async () => {
    expect(await buildVisitorKey(BASE)).toBe(await buildVisitorKey({ ...BASE }))
  })

  it('gives another key when the day, the shop, the client or the secret changes', async () => {
    const key = await buildVisitorKey(BASE)
    for (const change of [{ day: '2026-11-03' }, { shop: 'other.myshopify.com' }, { clientId: 'client-xyz' }, { secret: 'another' }]) {
      expect(await buildVisitorKey({ ...BASE, ...change })).not.toBe(key)
    }
  })

  it('is 64 hexadecimal characters and shows nothing of the client id', async () => {
    const key = await buildVisitorKey(BASE)
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(key).not.toContain('client')
  })
})
