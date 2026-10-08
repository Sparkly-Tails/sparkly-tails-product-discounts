import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest'
import { previewGroup, saveGroupRule, saveGroupSelection } from '@/timeDiscounts/groupActions'
import * as groupServer from '@/timeDiscounts/groupServer'
import * as timeConfigLib from '@/timeDiscounts/config'
import * as metafieldSync from '@/timeDiscounts/metafieldSync'
import * as shopLib from '@/lib/shop'
import * as shopifyClient from '@/lib/shopify-client'
import { NOT_A_GROUP_MESSAGE } from '@/timeDiscounts/group'
import type { TimeDiscount } from '@/timeDiscounts/config'

const P1 = 'gid://shopify/Product/1'
const P2 = 'gid://shopify/Product/2'
const covered = [{ productId: P1, title: 'Cat Toy', adminUrl: 'https://x/admin/products/1', regularPrice: 10, discountedPrice: 8 }]
const selection = { mode: 'products', members: [{ productId: P1, title: 'Cat Toy' }] }

beforeEach(() => vi.restoreAllMocks())

describe('previewGroup', () => {
  it('returns the covered rows for a valid group and writes nothing', async () => {
    const resolve = vi.spyOn(groupServer, 'resolveGroup').mockResolvedValue({ items: [], covered })
    expect(await previewGroup({ pricingMode: 'percent', amount: 20 }, selection, 'time_disc_1')).toEqual({ ok: true, covered })
    expect(resolve).toHaveBeenCalledWith(
      { pricingMode: 'percent', amount: 20, selection },
      'time_disc_1',
      expect.stringContaining('/admin/products/'),
    )
  })

  it('returns the reason as a result, not a thrown error', async () => {
    vi.spyOn(groupServer, 'resolveGroup').mockRejectedValue(new Error('Cat Toy: This product already belongs to another discount'))
    expect(await previewGroup({ pricingMode: 'percent', amount: 20 }, selection)).toEqual({ ok: false, error: 'Cat Toy: This product already belongs to another discount' })
  })

  it('rejects input that is not a rule and picks, without looking anything up', async () => {
    const resolve = vi.spyOn(groupServer, 'resolveGroup')
    expect(await previewGroup('nope', selection)).toEqual({ ok: false, error: expect.stringContaining('could not be read') })
    expect(await previewGroup({ pricingMode: 'percent', amount: 20 }, { mode: 'x' })).toEqual({ ok: false, error: expect.stringContaining('could not be read') })
    expect(resolve).not.toHaveBeenCalled()
  })
})

const groupDiscount = (over: Partial<TimeDiscount> = {}): TimeDiscount => ({
  discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'Flash', title: 'Flash Sale', kind: 'group',
  startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
  group: { pricingMode: 'percent', amount: 20, selection: { mode: 'products', members: [{ productId: P1, title: 'Cat Toy' }, { productId: P2, title: 'Dog Bed' }] } },
  items: [{ productId: P1, pricingMode: 'percent', amount: 20 }, { productId: P2, pricingMode: 'percent', amount: 20 }],
  ...over,
})
const rowsAt = (amount: number, ...ids: string[]) => ids.map((productId) => ({ productId, pricingMode: 'percent' as const, amount }))

describe('saving a group', () => {
  let saveSpy: MockInstance<typeof timeConfigLib.saveTimeDiscountsConfig>
  let shopifyQuerySpy: MockInstance<typeof shopifyClient.shopifyQuery>
  let resolveSpy: MockInstance<typeof groupServer.resolveGroup>
  const savedCovered = [{ productId: P1, title: 'Cat Toy', adminUrl: 'u', regularPrice: 10, discountedPrice: 7 }]

  function stored(discounts: TimeDiscount[]) {
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockImplementation(async () => structuredClone({ discounts }))
  }

  beforeEach(() => {
    vi.spyOn(shopLib, 'getShopTimezone').mockResolvedValue('Europe/London')
    vi.spyOn(metafieldSync, 'syncTimeDiscountMetafields').mockResolvedValue(undefined)
    vi.spyOn(metafieldSync, 'clearTimeDiscountMetafields').mockResolvedValue(undefined)
    saveSpy = vi.spyOn(timeConfigLib, 'saveTimeDiscountsConfig').mockResolvedValue(undefined)
    shopifyQuerySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ discountAutomaticAppUpdate: { userErrors: [] } })
    resolveSpy = vi.spyOn(groupServer, 'resolveGroup').mockResolvedValue({ items: rowsAt(30, P1, P2), covered: savedCovered })
    stored([groupDiscount()])
  })

  it('saves a new rule: checks it, updates Shopify first, stores the rows and the group, syncs, and returns the covered rows', async () => {
    const result = await saveGroupRule('time_disc_1', { pricingMode: 'percent', amount: 30 })

    expect(result).toEqual({ ok: true, covered: savedCovered })
    expect(resolveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ pricingMode: 'percent', amount: 30 }), 'time_disc_1', expect.stringContaining('/admin/products/'), { allowEmpty: true },
    )
    const sent = (shopifyQuerySpy.mock.calls[0][1] as { automaticAppDiscount: { metafields: { value: string }[] } }).automaticAppDiscount
    expect(JSON.parse(sent.metafields[0].value)).toEqual({ items: rowsAt(30, P1, P2) })
    const [savedDiscount] = saveSpy.mock.calls[0][0].discounts as TimeDiscount[]
    expect(savedDiscount.group).toMatchObject({ pricingMode: 'percent', amount: 30 })
    expect(savedDiscount.items).toEqual(rowsAt(30, P1, P2))
    expect(metafieldSync.syncTimeDiscountMetafields).toHaveBeenCalled()
    expect(metafieldSync.clearTimeDiscountMetafields).not.toHaveBeenCalled()
  })

  it('saves new picks, and clears the storefront price of a product that is no longer covered', async () => {
    resolveSpy.mockResolvedValue({ items: rowsAt(20, P1), covered: savedCovered })
    const picks = { mode: 'products', members: [{ productId: P1, title: 'Cat Toy' }] }
    expect(await saveGroupSelection('time_disc_1', picks)).toEqual({ ok: true, covered: savedCovered })

    expect(metafieldSync.clearTimeDiscountMetafields).toHaveBeenCalledWith([{ productId: P2 }])
    expect(metafieldSync.syncTimeDiscountMetafields).toHaveBeenCalled()
    const [savedDiscount] = saveSpy.mock.calls[0][0].discounts as TimeDiscount[]
    expect(savedDiscount.group?.selection).toEqual(picks)
  })

  it('allows every pick to be removed: the discount applies to nothing and every product is cleared', async () => {
    resolveSpy.mockResolvedValue({ items: [], covered: [] })
    expect(await saveGroupSelection('time_disc_1', { mode: 'products', members: [] })).toEqual({ ok: true, covered: [] })
    expect(metafieldSync.clearTimeDiscountMetafields).toHaveBeenCalledWith([{ productId: P1 }, { productId: P2 }])
    expect(metafieldSync.syncTimeDiscountMetafields).not.toHaveBeenCalled()
  })

  it('writes nothing when the group fails its checks', async () => {
    resolveSpy.mockRejectedValue(new Error('Cat Toy: The fixed price (£30.00) is not lower than the regular price (£10.00)'))
    expect(await saveGroupRule('time_disc_1', { pricingMode: 'fixed', amount: 30 })).toEqual({ ok: false, error: expect.stringContaining('Cat Toy') })
    expect(shopifyQuerySpy).not.toHaveBeenCalled()
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('does not save the app config when Shopify rejects the update', async () => {
    shopifyQuerySpy.mockResolvedValue({ discountAutomaticAppUpdate: { userErrors: [{ field: ['x'], message: 'Nope' }] } })
    expect(await saveGroupRule('time_disc_1', { pricingMode: 'percent', amount: 30 })).toEqual({ ok: false, error: 'Nope' })
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('still reports success when only the storefront update fails (the discount is saved and live)', async () => {
    vi.spyOn(metafieldSync, 'syncTimeDiscountMetafields').mockRejectedValue(new Error('sync down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await saveGroupRule('time_disc_1', { pricingMode: 'percent', amount: 30 })).toEqual({ ok: true, covered: savedCovered })
  })

  it('refuses a per-product discount, an unknown discount, and input that is not a rule or picks', async () => {
    stored([groupDiscount({ kind: 'perProduct', group: undefined })])
    expect(await saveGroupRule('time_disc_1', { pricingMode: 'percent', amount: 30 })).toEqual({ ok: false, error: NOT_A_GROUP_MESSAGE })
    expect(await saveGroupRule('missing', { pricingMode: 'percent', amount: 30 })).toEqual({ ok: false, error: 'Time discount missing not found' })
    stored([groupDiscount()])
    expect(await saveGroupRule('time_disc_1', 'nope')).toEqual({ ok: false, error: expect.stringContaining('could not be read') })
    expect(await saveGroupSelection('time_disc_1', { mode: 'x' })).toEqual({ ok: false, error: expect.stringContaining('could not be read') })
    expect(saveSpy).not.toHaveBeenCalled()
  })
})
