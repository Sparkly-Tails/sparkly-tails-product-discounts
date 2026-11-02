import { describe, it, expect } from 'vitest'
import { buildViewPayload } from '../../extensions/metrics-pixel/src/buildViewPayload.js'

describe('buildViewPayload', () => {
  it('makes the product gid from the plain id of the event and keeps the other values', () => {
    expect(JSON.parse(buildViewPayload({ shop: 'demo.myshopify.com', productId: '9876543210', clientId: 'abc-123' }))).toEqual({
      shop: 'demo.myshopify.com', productId: 'gid://shopify/Product/9876543210', clientId: 'abc-123',
    })
  })

  it('sends exactly three fields: nothing else of the event leaves the page', () => {
    expect(Object.keys(JSON.parse(buildViewPayload({ shop: 's.myshopify.com', productId: '1', clientId: 'c' }))).sort()).toEqual(['clientId', 'productId', 'shop'])
  })
})
