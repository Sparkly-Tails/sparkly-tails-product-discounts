import { describe, it, expect, vi, beforeEach } from 'vitest'
import { deleteDiscount } from '@/actions/discountActions'
import * as configLib from '@/lib/config'
import * as productTiers from '@/lib/product-tiers'
import { syncDiscountRecord } from '@/flash/discountRecord'
import type { Discount } from '@/lib/config'

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/shop', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/shop')>()), getShopTimezone: vi.fn(async () => 'Europe/London') }))
vi.mock('@/lib/shopify-client', () => ({ shopifyQuery: vi.fn() }))
vi.mock('@/flash/discountRecord', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/flash/discountRecord')>()), syncDiscountRecord: vi.fn() }))

const FUTURE = { startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59' }
const RECORD_ID = 'gid://shopify/DiscountAutomaticNode/7'

function setup(discount: Discount) {
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [discount] })
  const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
  const clearSpy = vi.spyOn(productTiers, 'clearDiscountMetafields').mockResolvedValue()
  return { saveSpy, clearSpy }
}

const plain: Discount = {
  discountId: 'disc_1', name: 'A', title: 'A', status: 'live', pricingMode: 'percent', members: [{ productId: 'gid://shopify/Product/1' }], tiers: [],
}
const flashSale: Discount = { ...plain, flash: { ...FUTURE, showTeaser: true, shopifyDiscountId: RECORD_ID } }

beforeEach(() => {
  vi.restoreAllMocks()
  vi.mocked(syncDiscountRecord).mockReset()
})

describe('deleteDiscount', () => {
  it('removes the discount and clears its metafields', async () => {
    const { saveSpy, clearSpy } = setup(plain)
    await deleteDiscount('disc_1')
    expect(saveSpy).toHaveBeenCalledWith({ discounts: [] })
    expect(clearSpy).toHaveBeenCalledWith([{ productId: 'gid://shopify/Product/1' }])
  })

  it('makes no Shopify discount call for a discount that is not a flash sale', async () => {
    setup(plain)
    await deleteDiscount('disc_1')
    expect(syncDiscountRecord).not.toHaveBeenCalled()
  })

  it('deletes the Shopify discount of a flash sale before it removes the discount', async () => {
    const { saveSpy } = setup(flashSale)
    vi.mocked(syncDiscountRecord).mockResolvedValue(undefined)
    await deleteDiscount('disc_1')
    expect(syncDiscountRecord).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft', flash: undefined, shopifyDiscountId: RECORD_ID }))
    expect(saveSpy).toHaveBeenCalledWith({ discounts: [] })
  })

  it('leaves the discount in place and shows the message when the Shopify discount cannot be deleted', async () => {
    const { saveSpy } = setup(flashSale)
    vi.mocked(syncDiscountRecord).mockRejectedValue(new Error('Shopify is unavailable'))
    await expect(deleteDiscount('disc_1')).rejects.toThrow('Shopify is unavailable')
    expect(saveSpy).not.toHaveBeenCalled()
  })
})
