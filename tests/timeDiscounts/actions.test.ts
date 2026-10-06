import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest'
import {
  createTimeDiscount, saveTimeDiscountTitle, saveTimeDiscountSchedule,
  saveTimeDiscountItem, removeTimeDiscountItem, deleteTimeDiscount,
} from '@/timeDiscounts/actions'
import * as timeConfigLib from '@/timeDiscounts/config'
import * as configLib from '@/lib/config'
import * as productsLib from '@/lib/products'
import * as metafieldSync from '@/timeDiscounts/metafieldSync'
import * as authRedirect from '@/lib/auth-redirect'
import * as shopLib from '@/lib/shop'
import * as shopifyClient from '@/lib/shopify-client'
import type { TimeDiscount, TimeDiscountItem } from '@/timeDiscounts/config'

const P1 = 'gid://shopify/Product/1'
const P2 = 'gid://shopify/Product/2'
const V10 = 'gid://shopify/ProductVariant/10'
const V11 = 'gid://shopify/ProductVariant/11'

function formData(entries: [string, string][]): FormData {
  const fd = new FormData()
  for (const [k, v] of entries) fd.append(k, v)
  return fd
}

function discountWith(items: TimeDiscountItem[], overrides: Partial<TimeDiscount> = {}): TimeDiscount {
  return {
    discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'Flash', title: 'Flash Sale',
    startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00', items,
    ...overrides,
  }
}

const pct = (productId: string, amount: number, variantId?: string): TimeDiscountItem => ({ productId, ...(variantId ? { variantId } : {}), pricingMode: 'percent', amount })

let saveSpy: MockInstance<typeof timeConfigLib.saveTimeDiscountsConfig>
let shopifyQuerySpy: MockInstance<typeof shopifyClient.shopifyQuery>
let redirectSpy: MockInstance<typeof authRedirect.redirectWithToken>

/** Sets up the stored config and a Shopify that accepts every mutation. */
function storedDiscounts(discounts: TimeDiscount[]) {
  vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockImplementation(async () => structuredClone({ discounts }))
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })
  redirectSpy = vi.spyOn(authRedirect, 'redirectWithToken').mockResolvedValue(undefined as never)
  vi.spyOn(productsLib, 'getMemberInfo').mockResolvedValue([{ productId: P1, title: 'X', price: 10, handle: 'x', imageUrl: null }])
  vi.spyOn(shopLib, 'getShopTimezone').mockResolvedValue('Europe/London')
  vi.spyOn(metafieldSync, 'syncTimeDiscountMetafields').mockResolvedValue(undefined)
  vi.spyOn(metafieldSync, 'clearTimeDiscountMetafields').mockResolvedValue(undefined)
  saveSpy = vi.spyOn(timeConfigLib, 'saveTimeDiscountsConfig').mockResolvedValue(undefined)
  shopifyQuerySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ discountAutomaticAppUpdate: { userErrors: [] } })
  storedDiscounts([])
})

/** The `automaticAppDiscount` input of the Shopify mutation call at `index`. */
function sentToShopify(index = 0) {
  return (shopifyQuerySpy.mock.calls[index][1] as { automaticAppDiscount: Record<string, unknown> }).automaticAppDiscount
}

function functionConfigSent(index = 0) {
  const metafields = sentToShopify(index).metafields as { namespace: string; key: string; value: string }[]
  return { metafield: metafields[0], parsed: JSON.parse(metafields[0].value) }
}

describe('createTimeDiscount', () => {
  const valid: [string, string][] = [['title', 'Summer Sale'], ['startsAt', '2026-01-01T00:00'], ['endsAt', '2026-01-02T00:00']]

  it('rejects a submission with no title', async () => {
    await expect(createTimeDiscount(formData([['startsAt', '2026-01-01T00:00'], ['endsAt', '2026-01-02T00:00']]))).rejects.toThrow('A title is required')
  })

  it('rejects an end before the start, before anything is created in Shopify', async () => {
    await expect(createTimeDiscount(formData([['title', 'T'], ['startsAt', '2026-01-02T00:00'], ['endsAt', '2026-01-01T00:00']]))).rejects.toThrow('End must be after start')
    expect(shopifyQuerySpy).not.toHaveBeenCalled()
  })

  it('creates the Shopify record with UTC dates and an empty function config, saves a discount with no rows, and opens it', async () => {
    shopifyQuerySpy.mockResolvedValueOnce({
      discountAutomaticAppCreate: { automaticAppDiscount: { discountId: 'gid://shopify/DiscountAutomaticApp/99' }, userErrors: [] },
    })

    await createTimeDiscount(formData([['title', 'Summer Sale'], ['startsAt', '2026-07-01T12:00'], ['endsAt', '2026-07-02T12:00']]))

    const sent = sentToShopify()
    expect(sent.title).toBe('Summer Sale')
    expect(sent.startsAt).toBe('2026-07-01T11:00:00.000Z') // BST is UTC+1
    expect(sent.endsAt).toBe('2026-07-02T11:00:00.000Z')
    expect(sent.functionHandle).toBe('time-based-discount')
    expect(functionConfigSent().metafield).toMatchObject({ namespace: 'sparkly_time_discounts', key: 'function_config' })
    expect(functionConfigSent().parsed).toEqual({ items: [] })

    const [saved] = saveSpy.mock.calls[0][0].discounts as TimeDiscount[]
    expect(saved).toMatchObject({
      shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/99', title: 'Summer Sale', name: 'Summer Sale',
      startsAt: '2026-07-01T12:00', endsAt: '2026-07-02T12:00', items: [],
    })
    expect(redirectSpy).toHaveBeenCalledWith(`/time-discounts/${encodeURIComponent(saved.discountId)}`)
  })

  it('rolls back the Shopify record when saving the app config fails, so no invisible live discount is left behind', async () => {
    shopifyQuerySpy
      .mockResolvedValueOnce({ discountAutomaticAppCreate: { automaticAppDiscount: { discountId: 'gid://shopify/DiscountAutomaticApp/99' }, userErrors: [] } })
      .mockResolvedValueOnce({ discountAutomaticDelete: { userErrors: [] } })
    saveSpy.mockRejectedValueOnce(new Error('metafield write failed'))

    await expect(createTimeDiscount(formData(valid))).rejects.toThrow('metafield write failed')

    expect(shopifyQuerySpy).toHaveBeenLastCalledWith(expect.stringContaining('discountAutomaticDelete'), { id: 'gid://shopify/DiscountAutomaticApp/99' })
  })

  it('throws Shopify userErrors instead of saving anything', async () => {
    shopifyQuerySpy.mockResolvedValueOnce({ discountAutomaticAppCreate: { automaticAppDiscount: null, userErrors: [{ field: ['x'], message: 'Title taken' }] } })
    await expect(createTimeDiscount(formData(valid))).rejects.toThrow('Title taken')
    expect(saveSpy).not.toHaveBeenCalled()
  })
})

describe('saveTimeDiscountTitle', () => {
  it('updates the Shopify record, the title and the legacy name, then re-syncs the storefront', async () => {
    storedDiscounts([discountWith([pct(P1, 20)], { name: 'Old internal name' })])

    expect(await saveTimeDiscountTitle('time_disc_1', '  Winter Sale ')).toEqual({ ok: true })

    expect(sentToShopify()).toEqual({ title: 'Winter Sale' })
    expect(saveSpy.mock.calls[0][0].discounts[0]).toMatchObject({ title: 'Winter Sale', name: 'Winter Sale' })
    expect(metafieldSync.syncTimeDiscountMetafields).toHaveBeenCalledWith(expect.objectContaining({ title: 'Winter Sale' }), 'Europe/London', undefined)
  })

  it('refuses an empty title without touching Shopify', async () => {
    storedDiscounts([discountWith([])])
    expect(await saveTimeDiscountTitle('time_disc_1', '   ')).toEqual({ ok: false, error: 'A title is required' })
    expect(shopifyQuerySpy).not.toHaveBeenCalled()
  })

  it('reports an unknown discount as a result, not a thrown error', async () => {
    const result = await saveTimeDiscountTitle('nope', 'X')
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toContain('not found')
  })

  it('does not save the app config when Shopify rejects the update', async () => {
    storedDiscounts([discountWith([])])
    shopifyQuerySpy.mockResolvedValueOnce({ discountAutomaticAppUpdate: { userErrors: [{ field: ['title'], message: 'Nope' }] } })
    expect(await saveTimeDiscountTitle('time_disc_1', 'X')).toEqual({ ok: false, error: 'Nope' })
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('still reports success when only the storefront sync fails (the discount is saved and live)', async () => {
    storedDiscounts([discountWith([pct(P1, 20)])])
    vi.spyOn(metafieldSync, 'syncTimeDiscountMetafields').mockRejectedValue(new Error('sync down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await saveTimeDiscountTitle('time_disc_1', 'X')).toEqual({ ok: true })
  })
})

describe('saveTimeDiscountSchedule', () => {
  it('sends UTC dates to Shopify, saves the shop-local dates, and re-syncs', async () => {
    storedDiscounts([discountWith([pct(P1, 20)])])

    expect(await saveTimeDiscountSchedule('time_disc_1', '2026-07-01T12:00', '2026-07-02T12:00')).toEqual({ ok: true })

    expect(sentToShopify()).toEqual({ startsAt: '2026-07-01T11:00:00.000Z', endsAt: '2026-07-02T11:00:00.000Z' })
    expect(saveSpy.mock.calls[0][0].discounts[0]).toMatchObject({ startsAt: '2026-07-01T12:00', endsAt: '2026-07-02T12:00' })
    expect(metafieldSync.syncTimeDiscountMetafields).toHaveBeenCalled()
  })

  it('rejects an end that is not after the start, without touching Shopify', async () => {
    storedDiscounts([discountWith([])])
    expect(await saveTimeDiscountSchedule('time_disc_1', '2026-07-02T12:00', '2026-07-02T12:00')).toEqual({ ok: false, error: 'End must be after start' })
    expect(shopifyQuerySpy).not.toHaveBeenCalled()
  })

  it('rejects a missing date', async () => {
    storedDiscounts([discountWith([])])
    expect(await saveTimeDiscountSchedule('time_disc_1', '', '2026-07-02T12:00')).toEqual({ ok: false, error: 'Start and end date/time are required' })
  })
})

describe('saveTimeDiscountItem', () => {
  it('adds a new row: updates the Shopify function config, saves, and syncs only that product', async () => {
    storedDiscounts([discountWith([pct(P2, 10)])])

    expect(await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'percent', amount: 20 })).toEqual({ ok: true })

    expect(functionConfigSent().parsed).toEqual({ items: [pct(P2, 10), pct(P1, 20)] })
    expect(saveSpy.mock.calls[0][0].discounts[0].items).toEqual([pct(P2, 10), pct(P1, 20)])
    expect(metafieldSync.syncTimeDiscountMetafields).toHaveBeenCalledWith(expect.anything(), 'Europe/London', [P1])
  })

  it('replaces the rule of an existing row instead of adding a second one', async () => {
    storedDiscounts([discountWith([pct(P1, 10, V10), pct(P1, 30, V11)])])

    await saveTimeDiscountItem('time_disc_1', { productId: P1, variantId: V10, pricingMode: 'fixed', amount: 5 })

    expect(saveSpy.mock.calls[0][0].discounts[0].items).toEqual([
      { productId: P1, variantId: V10, pricingMode: 'fixed', amount: 5 },
      pct(P1, 30, V11),
    ])
  })

  it('rounds the amount to pence', async () => {
    storedDiscounts([discountWith([])])
    await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'percent', amount: 12.345 })
    expect(saveSpy.mock.calls[0][0].discounts[0].items[0].amount).toBe(12.35)
  })

  it('accepts a fixed price below the regular price', async () => {
    storedDiscounts([discountWith([])])
    expect(await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'fixed', amount: 9.99 })).toEqual({ ok: true })
    expect(saveSpy.mock.calls[0][0].discounts[0].items).toEqual([{ productId: P1, pricingMode: 'fixed', amount: 9.99 }])
  })

  it.each([['higher than', 12], ['equal to', 10]])('rejects a fixed price %s the regular price, before anything is sent to Shopify', async (_label, amount) => {
    storedDiscounts([discountWith([])])
    const result = await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'fixed', amount })
    expect(result).toEqual({ ok: false, error: expect.stringContaining('is not lower than the regular price (£10.00)') })
    expect(shopifyQuerySpy).not.toHaveBeenCalled()
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('judges each row against its own regular price', async () => {
    storedDiscounts([discountWith([])])
    vi.spyOn(productsLib, 'getMemberInfo').mockResolvedValue([{ productId: P1, variantId: V10, title: 'X – Large', price: 60, handle: 'x', imageUrl: null }])
    expect(await saveTimeDiscountItem('time_disc_1', { productId: P1, variantId: V10, pricingMode: 'fixed', amount: 50 })).toEqual({ ok: true })
    expect(productsLib.getMemberInfo).toHaveBeenCalledWith([{ productId: P1, variantId: V10 }])
  })

  it('does not look up a price for a percentage row', async () => {
    storedDiscounts([discountWith([])])
    await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'percent', amount: 20 })
    expect(productsLib.getMemberInfo).not.toHaveBeenCalled()
  })

  it('reports a product Shopify cannot find', async () => {
    storedDiscounts([discountWith([])])
    vi.spyOn(productsLib, 'getMemberInfo').mockResolvedValue([])
    expect(await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'fixed', amount: 5 })).toEqual({ ok: false, error: 'This product could not be found in Shopify' })
  })

  it.each([[0], [-5], [Number.NaN]])('rejects an amount of %s', async (amount) => {
    storedDiscounts([discountWith([])])
    const result = await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'percent', amount })
    expect(result).toEqual({ ok: false, error: 'Enter an amount greater than zero' })
  })

  it('rejects a percentage over 100', async () => {
    storedDiscounts([discountWith([])])
    expect(await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'percent', amount: 101 })).toEqual({ ok: false, error: 'A percentage discount cannot exceed 100%' })
  })

  it('rejects a product that already belongs to another discount', async () => {
    storedDiscounts([
      discountWith([]),
      discountWith([pct(P1, 10)], { discountId: 'time_disc_2' }),
    ])
    expect(await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'percent', amount: 20 })).toEqual({ ok: false, error: 'This product already belongs to another discount' })
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('rejects a product that already belongs to a tier discount', async () => {
    storedDiscounts([discountWith([])])
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      discounts: [{ discountId: 'tier_1', name: 'Tiers', status: 'active', pricingMode: 'percent', tiers: [], members: [{ productId: P1 }] }],
    } as never)
    const result = await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'percent', amount: 20 })
    expect(result).toEqual({ ok: false, error: 'This product already belongs to another discount' })
  })

  it('does not re-check availability when only editing a row already in this discount', async () => {
    storedDiscounts([discountWith([pct(P1, 10)])])
    // The only discount holding P1 is this one, so availability would pass anyway; make the check observable instead.
    const availability = await import('@/lib/discount-availability')
    const spy = vi.spyOn(availability, 'isAvailableEverywhere')
    await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'percent', amount: 30 })
    expect(spy).not.toHaveBeenCalled()
  })

  it('rejects a variant row next to a whole-product row of the same product', async () => {
    storedDiscounts([discountWith([pct(P1, 10)])])
    expect(await saveTimeDiscountItem('time_disc_1', { productId: P1, variantId: V10, pricingMode: 'percent', amount: 20 })).toEqual({
      ok: false, error: 'A product cannot have both a whole-product row and variant rows',
    })
  })

  it('rejects a row that would not fit the Function config, leaving everything unchanged', async () => {
    const many: TimeDiscountItem[] = Array.from({ length: 70 }, (_, i) => ({
      productId: `gid://shopify/Product/${10_000_000_000_000 + i}`,
      variantId: `gid://shopify/ProductVariant/${50_000_000_000_000 + i}`,
      pricingMode: 'percent', amount: 20.5,
    }))
    storedDiscounts([discountWith(many)])
    const result = await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'percent', amount: 20 })
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toContain('too many products/variants')
    expect(shopifyQuerySpy).not.toHaveBeenCalled()
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('does not save the app config when Shopify rejects the update', async () => {
    storedDiscounts([discountWith([])])
    shopifyQuerySpy.mockResolvedValueOnce({ discountAutomaticAppUpdate: { userErrors: [{ field: ['metafields'], message: 'Function failed' }] } })
    expect(await saveTimeDiscountItem('time_disc_1', { productId: P1, pricingMode: 'percent', amount: 20 })).toEqual({ ok: false, error: 'Function failed' })
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('reports an unknown discount as a result', async () => {
    const result = await saveTimeDiscountItem('nope', { productId: P1, pricingMode: 'percent', amount: 20 })
    expect(result.ok).toBe(false)
  })
})

describe('removeTimeDiscountItem', () => {
  it('removes the row, updates Shopify and the app config, and clears the product\'s storefront metafield when it has no rows left', async () => {
    storedDiscounts([discountWith([pct(P1, 10), pct(P2, 20)])])

    expect(await removeTimeDiscountItem('time_disc_1', { productId: P1 })).toEqual({ ok: true })

    expect(functionConfigSent().parsed).toEqual({ items: [pct(P2, 20)] })
    expect(saveSpy.mock.calls[0][0].discounts[0].items).toEqual([pct(P2, 20)])
    expect(metafieldSync.clearTimeDiscountMetafields).toHaveBeenCalledWith([{ productId: P1 }])
    expect(metafieldSync.syncTimeDiscountMetafields).not.toHaveBeenCalled()
  })

  it('re-syncs instead of clearing when the product still has other variant rows', async () => {
    storedDiscounts([discountWith([pct(P1, 10, V10), pct(P1, 20, V11)])])

    await removeTimeDiscountItem('time_disc_1', { productId: P1, variantId: V10 })

    expect(saveSpy.mock.calls[0][0].discounts[0].items).toEqual([pct(P1, 20, V11)])
    expect(metafieldSync.syncTimeDiscountMetafields).toHaveBeenCalledWith(expect.anything(), 'Europe/London', [P1])
    expect(metafieldSync.clearTimeDiscountMetafields).not.toHaveBeenCalled()
  })

  it('removing a row that is already gone is a harmless no-op', async () => {
    storedDiscounts([discountWith([pct(P2, 20)])])
    expect(await removeTimeDiscountItem('time_disc_1', { productId: P1 })).toEqual({ ok: true })
    expect(shopifyQuerySpy).not.toHaveBeenCalled()
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('can remove the last row, leaving a valid discount that applies to nothing', async () => {
    storedDiscounts([discountWith([pct(P1, 10)])])
    expect(await removeTimeDiscountItem('time_disc_1', { productId: P1 })).toEqual({ ok: true })
    expect(functionConfigSent().parsed).toEqual({ items: [] })
  })

  it('does not save the app config when Shopify rejects the update', async () => {
    storedDiscounts([discountWith([pct(P1, 10)])])
    shopifyQuerySpy.mockResolvedValueOnce({ discountAutomaticAppUpdate: { userErrors: [{ field: ['x'], message: 'Nope' }] } })
    expect(await removeTimeDiscountItem('time_disc_1', { productId: P1 })).toEqual({ ok: false, error: 'Nope' })
    expect(saveSpy).not.toHaveBeenCalled()
  })
})

describe('deleteTimeDiscount', () => {
  it('deletes the Shopify record first, then the app entry, clears every product\'s metafield, and returns to the list', async () => {
    storedDiscounts([discountWith([pct(P1, 10), pct(P2, 20)]), discountWith([], { discountId: 'time_disc_2' })])
    shopifyQuerySpy.mockResolvedValueOnce({ discountAutomaticDelete: { userErrors: [] } })

    await deleteTimeDiscount('time_disc_1')

    expect(shopifyQuerySpy).toHaveBeenCalledWith(expect.stringContaining('discountAutomaticDelete'), { id: 'gid://shopify/DiscountAutomaticApp/1' })
    expect(saveSpy).toHaveBeenCalledWith({ discounts: [expect.objectContaining({ discountId: 'time_disc_2' })] })
    expect(metafieldSync.clearTimeDiscountMetafields).toHaveBeenCalledWith([pct(P1, 10), pct(P2, 20)])
    expect(redirectSpy).toHaveBeenCalledWith('/')
  })

  it('keeps the app entry when Shopify refuses the delete, so the merchant can retry', async () => {
    storedDiscounts([discountWith([])])
    shopifyQuerySpy.mockResolvedValueOnce({ discountAutomaticDelete: { userErrors: [{ field: ['id'], message: 'Locked' }] } })
    await expect(deleteTimeDiscount('time_disc_1')).rejects.toThrow('Locked')
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('treats a Shopify record that is already gone as deleted', async () => {
    storedDiscounts([discountWith([])])
    shopifyQuerySpy.mockResolvedValueOnce({ discountAutomaticDelete: { userErrors: [{ field: ['id'], message: 'Discount not found' }] } })
    await expect(deleteTimeDiscount('time_disc_1')).resolves.toBeUndefined()
    expect(saveSpy).toHaveBeenCalledWith({ discounts: [] })
  })
})
