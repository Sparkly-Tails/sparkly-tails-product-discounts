import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncTimeDiscountMetafields, clearTimeDiscountMetafields } from '@/timeDiscounts/metafieldSync'
import * as shopifyClient from '@/lib/shopify-client'
import type { TimeDiscount } from '@/timeDiscounts/config'

const discount: TimeDiscount = {
  discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'Flash', title: 'Flash Sale', pricingMode: 'percent', amount: 20,
  startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
  selection: { mode: 'products', members: [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }] },
  resolvedMembers: [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }],
}

describe('syncTimeDiscountMetafields', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('writes one metafield per unique product in resolvedMembers', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsSet: { userErrors: [] } })
    await syncTimeDiscountMetafields(discount)

    expect(spy).toHaveBeenCalledTimes(2)
    const call1 = spy.mock.calls.find((c) => (c[1] as { metafields: { ownerId: string }[] }).metafields[0].ownerId === 'gid://shopify/Product/1')!
    const parsed = JSON.parse((call1[1] as { metafields: { value: string }[] }).metafields[0].value)
    expect(parsed).toEqual({
      discountId: 'time_disc_1', title: 'Flash Sale', pricingMode: 'percent', amount: 20,
      startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
    })
  })

  it('dedupes when a product appears twice in resolvedMembers (e.g. two variants)', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsSet: { userErrors: [] } })
    await syncTimeDiscountMetafields({
      ...discount,
      resolvedMembers: [
        { productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/10' },
        { productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/11' },
      ],
    })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('aggregates and throws on any rejected write instead of swallowing it', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery')
    spy.mockResolvedValueOnce({ metafieldsSet: { userErrors: [] } })
    spy.mockRejectedValueOnce(new Error('boom'))
    await expect(syncTimeDiscountMetafields(discount)).rejects.toThrow('boom')
  })
})

describe('clearTimeDiscountMetafields', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('deletes the metafield from every unique product', async () => {
    const spy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ metafieldsDelete: { userErrors: [] } })
    await clearTimeDiscountMetafields([{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/1' }])
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
