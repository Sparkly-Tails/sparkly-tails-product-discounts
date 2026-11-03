import { describe, it, expect } from 'vitest'
import { getRequestHost, pickRequestHost, REQUEST_HOST_TOOLS } from '@/lib/requestHost'

const read = (values: Record<string, string>) => getRequestHost({ readHeaders: async () => new Headers(values), tools: REQUEST_HOST_TOOLS })

describe('pickRequestHost', () => {
  it('prefers the host the proxy forwarded, which is the address the visitor used', () => {
    expect(pickRequestHost({ forwarded: 'my-app.vercel.app', host: 'internal:3000' })).toBe('my-app.vercel.app')
  })

  it('falls back to the host header, then to an empty text', () => {
    expect(pickRequestHost({ forwarded: null, host: 'my-app.vercel.app' })).toBe('my-app.vercel.app')
    expect(pickRequestHost({ forwarded: null, host: null })).toBe('')
  })
})

describe('getRequestHost', () => {
  it('reads the two headers of the request', async () => {
    expect(await read({ 'x-forwarded-host': 'my-app.vercel.app', host: 'internal:3000' })).toBe('my-app.vercel.app')
  })

  it('gives an empty text when there is no request at all', async () => {
    const host = await getRequestHost({ readHeaders: async () => { throw new Error('outside a request') }, tools: REQUEST_HOST_TOOLS })
    expect(host).toBe('')
  })
})
