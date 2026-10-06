import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncTimeDiscountMetafields, clearTimeDiscountMetafields } from '@/timeDiscounts/metafieldSync'
import * as shopifyClient from '@/lib/shopify-client'
import { zonedTimeToUtc } from '@/lib/shop'
import type { TimeDiscount } from '@/timeDiscounts/config'

const TIME_ZONE = 'Europe/London'

const discount: TimeDiscount = {
  discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'Flash', title: 'Flash Sale',
  startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
  items: [
    { productId: 'gid://shopify/Product/1', pricingMode: 'percent', amount: 20 },
    { productId: 'gid://shopify/Product/2', pricingMode: 'fixed', amount: 22.5 },
  ],
}

type MetafieldCall = { ownerId: string; namespace: string; key: string; type: string; value: string }

function writtenMetafields(spy: { mock: { calls: unknown[][] } }): MetafieldCall[] {
  return spy.mock.calls.map((c) => (c[1] as { metafields: MetafieldCall[] }).metafields[0])
}

describe('syncTimeDiscountMetafields', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('writes one metafield per unique product to the namespace/key the Liquid blocks read, with dates as real UTC instants', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsSet: { userErrors: [] } })
    await syncTimeDiscountMetafields(discount, TIME_ZONE)

    expect(spy).toHaveBeenCalledTimes(2)
    const written = writtenMetafields(spy).find((m) => m.ownerId === 'gid://shopify/Product/1')!
    expect(written.namespace).toBe('sparkly_product_discounts')
    expect(written.key).toBe('time_based_discount')
    expect(written.type).toBe('json')
    expect(JSON.parse(written.value)).toEqual({
      discountId: 'time_disc_1', title: 'Flash Sale',
      startsAt: zonedTimeToUtc('2026-01-01T00:00', TIME_ZONE), endsAt: zonedTimeToUtc('2026-01-02T00:00', TIME_ZONE),
      items: [{ variantId: null, pricingMode: 'percent', amount: 20 }],
    })
  })

  it('carries each product\'s own rule as-is — no price lookup, the scripts derive the display from the live variant price', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsSet: { userErrors: [] } })
    await syncTimeDiscountMetafields(discount, TIME_ZONE)

    const byProduct = Object.fromEntries(writtenMetafields(spy).map((m) => [m.ownerId, JSON.parse(m.value).items]))
    expect(byProduct['gid://shopify/Product/1']).toEqual([{ variantId: null, pricingMode: 'percent', amount: 20 }])
    expect(byProduct['gid://shopify/Product/2']).toEqual([{ variantId: null, pricingMode: 'fixed', amount: 22.5 }])
  })

  it('writes one metafield for a product with several variant rows, each with its own rule', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsSet: { userErrors: [] } })
    await syncTimeDiscountMetafields({
      ...discount,
      items: [
        { productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/10', pricingMode: 'fixed', amount: 22 },
        { productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/11', pricingMode: 'percent', amount: 50 },
      ],
    }, TIME_ZONE)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(JSON.parse(writtenMetafields(spy)[0].value).items).toEqual([
      { variantId: 'gid://shopify/ProductVariant/10', pricingMode: 'fixed', amount: 22 },
      { variantId: 'gid://shopify/ProductVariant/11', pricingMode: 'percent', amount: 50 },
    ])
  })

  it('can be limited to some products, so changing one row does not rewrite every product', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsSet: { userErrors: [] } })
    await syncTimeDiscountMetafields(discount, TIME_ZONE, ['gid://shopify/Product/2'])

    expect(spy).toHaveBeenCalledTimes(1)
    expect(writtenMetafields(spy)[0].ownerId).toBe('gid://shopify/Product/2')
  })

  it('writes nothing for a discount with no rows', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    await syncTimeDiscountMetafields({ ...discount, items: [] }, TIME_ZONE)
    expect(spy).not.toHaveBeenCalled()
  })

  it('aggregates and throws on any rejected write instead of swallowing it', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    spy.mockResolvedValueOnce({ metafieldsSet: { userErrors: [] } })
    spy.mockRejectedValueOnce(new Error('boom'))
    await expect(syncTimeDiscountMetafields(discount, TIME_ZONE)).rejects.toThrow('boom')
  })

  it('throws on Shopify userErrors', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsSet: { userErrors: [{ field: ['x'], message: 'bad value' }] } })
    await expect(syncTimeDiscountMetafields(discount, TIME_ZONE)).rejects.toThrow('bad value')
  })
})

describe('clearTimeDiscountMetafields', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('deletes the metafield from every unique product', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsDelete: { userErrors: [] } })
    await clearTimeDiscountMetafields([{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/1' }])
    expect(spy).toHaveBeenCalledTimes(1)
    expect((spy.mock.calls[0][1] as { metafields: unknown[] }).metafields).toEqual([
      { ownerId: 'gid://shopify/Product/1', namespace: 'sparkly_product_discounts', key: 'time_based_discount' },
    ])
  })
})
