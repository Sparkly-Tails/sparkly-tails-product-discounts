import { describe, it, expect, vi } from 'vitest'
import { mapLiveProducts, refreshLiveProducts, refreshLiveProductsSafely, REFRESH_TOOLS } from '@/metrics/refreshSettings'

const discounts = [
  { discountId: 'd1', status: 'live', members: [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2', variantId: 'v' }] },
  { discountId: 'd2', status: 'draft', members: [{ productId: 'gid://shopify/Product/3' }] },
  { discountId: 'd3', status: 'live', members: [{ productId: 'gid://shopify/Product/4' }] },
]

describe('mapLiveProducts', () => {
  it('maps every product of a live discount to that discount, and leaves out drafts', () => {
    expect(mapLiveProducts({ discounts })).toEqual({
      'gid://shopify/Product/1': 'd1', 'gid://shopify/Product/2': 'd1', 'gid://shopify/Product/4': 'd3',
    })
  })

  it('gives an empty map when no discount is live', () => {
    expect(mapLiveProducts({ discounts: [discounts[1]] })).toEqual({})
  })
})

describe('refreshLiveProducts', () => {
  it('saves the map for the shop', async () => {
    const saveLiveProducts = vi.fn(async () => {})
    await refreshLiveProducts({ shop: 'demo.myshopify.com', discounts, saveLiveProducts, tools: REFRESH_TOOLS })
    expect(saveLiveProducts).toHaveBeenCalledExactlyOnceWith({ shop: 'demo.myshopify.com', liveProducts: mapLiveProducts({ discounts }) })
  })
})

describe('refreshLiveProductsSafely', () => {
  it('saves for the shop of the request', async () => {
    const saveLiveProducts = vi.fn(async () => {})
    await refreshLiveProductsSafely({ discounts, getShop: async () => 'demo.myshopify.com', saveLiveProducts, report: vi.fn(), tools: REFRESH_TOOLS })
    expect(saveLiveProducts).toHaveBeenCalledTimes(1)
  })

  it('never throws: a failing database is reported and the save of the discount goes on', async () => {
    const report = vi.fn()
    await expect(refreshLiveProductsSafely({
      discounts, getShop: async () => 'demo.myshopify.com', saveLiveProducts: async () => { throw new Error('no table') }, report, tools: REFRESH_TOOLS,
    })).resolves.toBeUndefined()
    expect(report).toHaveBeenCalledWith(expect.stringContaining('no table'))
  })

  it('never throws when there is no shop for the request either', async () => {
    const report = vi.fn()
    await expect(refreshLiveProductsSafely({ discounts, getShop: async () => { throw new Error('No shop for this request') }, saveLiveProducts: vi.fn(), report, tools: REFRESH_TOOLS })).resolves.toBeUndefined()
    expect(report).toHaveBeenCalledTimes(1)
  })
})
