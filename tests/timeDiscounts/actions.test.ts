import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createTimeDiscount, updateTimeDiscountSelection, updateTimeDiscountSchedule,
  updateTimeDiscountTitle, deleteTimeDiscount,
} from '@/timeDiscounts/actions'
import * as timeConfigLib from '@/timeDiscounts/config'
import * as configLib from '@/lib/config'
import * as productsLib from '@/lib/products'
import * as metafieldSync from '@/timeDiscounts/metafieldSync'
import * as authRedirect from '@/lib/auth-redirect'
import * as shopLib from '@/lib/shop'
import * as shopifyClient from '@/lib/shopify-client'
import type { TimeDiscount } from '@/timeDiscounts/config'

function formData(entries: [string, string][]): FormData {
  const fd = new FormData()
  for (const [k, v] of entries) fd.append(k, v)
  return fd
}

const existingDiscount: TimeDiscount = {
  discountId: 'time_disc_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/1', name: 'Flash', title: 'Flash Sale',
  pricingMode: 'percent', amount: 20, startsAt: '2026-01-01T00:00', endsAt: '2026-01-02T00:00',
  selection: { mode: 'products', members: [{ productId: 'gid://shopify/Product/1' }] },
  resolvedMembers: [{ productId: 'gid://shopify/Product/1' }],
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })
  vi.spyOn(authRedirect, 'redirectWithToken').mockResolvedValue(undefined as never)
  vi.spyOn(productsLib, 'getMemberInfo').mockResolvedValue([{ productId: 'gid://shopify/Product/1', title: 'X', price: 10, handle: 'x', imageUrl: null }])
  vi.spyOn(shopLib, 'getShopTimezone').mockResolvedValue('Europe/London')
  vi.spyOn(metafieldSync, 'syncTimeDiscountMetafields').mockResolvedValue(undefined)
  vi.spyOn(metafieldSync, 'clearTimeDiscountMetafields').mockResolvedValue(undefined)
})

describe('createTimeDiscount', () => {
  it('rejects a submission with no name', async () => {
    await expect(createTimeDiscount(formData([['title', 'T'], ['startsAt', '2026-01-01T00:00'], ['endsAt', '2026-01-02T00:00'], ['pricingMode', 'percent'], ['amount', '10'], ['selectionMode', 'products'], ['member-0-productId', 'gid://shopify/Product/1']])))
      .rejects.toThrow('A name is required')
  })

  it('rejects end before start', async () => {
    await expect(createTimeDiscount(formData([['name', 'N'], ['title', 'T'], ['startsAt', '2026-01-02T00:00'], ['endsAt', '2026-01-01T00:00'], ['pricingMode', 'percent'], ['amount', '10'], ['selectionMode', 'products'], ['member-0-productId', 'gid://shopify/Product/1']])))
      .rejects.toThrow('End must be after start')
  })

  it('rejects a fixed-price discount whose members have different prices', async () => {
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [] })
    vi.spyOn(productsLib, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', title: 'A', price: 10, handle: 'a', imageUrl: null },
      { productId: 'gid://shopify/Product/2', title: 'B', price: 20, handle: 'b', imageUrl: null },
    ])
    await expect(createTimeDiscount(formData([
      ['name', 'N'], ['title', 'T'], ['startsAt', '2026-01-01T00:00'], ['endsAt', '2026-01-02T00:00'],
      ['pricingMode', 'fixed'], ['amount', '5'], ['selectionMode', 'products'],
      ['member-0-productId', 'gid://shopify/Product/1'], ['member-1-productId', 'gid://shopify/Product/2'],
    ]))).rejects.toThrow('different prices')
  })

  it('rejects a percent amount over 100', async () => {
    await expect(createTimeDiscount(formData([
      ['name', 'N'], ['title', 'T'], ['startsAt', '2026-01-01T00:00'], ['endsAt', '2026-01-02T00:00'],
      ['pricingMode', 'percent'], ['amount', '101'], ['selectionMode', 'products'], ['member-0-productId', 'gid://shopify/Product/1'],
    ]))).rejects.toThrow('cannot exceed 100%')
  })

  it('rejects a percent amount of 100.01', async () => {
    await expect(createTimeDiscount(formData([
      ['name', 'N'], ['title', 'T'], ['startsAt', '2026-01-01T00:00'], ['endsAt', '2026-01-02T00:00'],
      ['pricingMode', 'percent'], ['amount', '100.01'], ['selectionMode', 'products'], ['member-0-productId', 'gid://shopify/Product/1'],
    ]))).rejects.toThrow('cannot exceed 100%')
  })

  it('allows a percent amount of exactly 100', async () => {
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [] })
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      discountAutomaticAppCreate: { automaticAppDiscount: { discountId: 'gid://shopify/DiscountAutomaticApp/99' }, userErrors: [] },
    })
    vi.spyOn(timeConfigLib, 'saveTimeDiscountsConfig').mockResolvedValue(undefined)

    await expect(createTimeDiscount(formData([
      ['name', 'N'], ['title', 'T'], ['startsAt', '2026-01-01T00:00'], ['endsAt', '2026-01-02T00:00'],
      ['pricingMode', 'percent'], ['amount', '100'], ['selectionMode', 'products'], ['member-0-productId', 'gid://shopify/Product/1'],
    ]))).resolves.toBeUndefined()
  })

  it('allows a fixed-price amount over 100 (no regression — a fixed price is a real currency amount, not a percentage)', async () => {
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [] })
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      discountAutomaticAppCreate: { automaticAppDiscount: { discountId: 'gid://shopify/DiscountAutomaticApp/99' }, userErrors: [] },
    })
    vi.spyOn(timeConfigLib, 'saveTimeDiscountsConfig').mockResolvedValue(undefined)

    await expect(createTimeDiscount(formData([
      ['name', 'N'], ['title', 'T'], ['startsAt', '2026-01-01T00:00'], ['endsAt', '2026-01-02T00:00'],
      ['pricingMode', 'fixed'], ['amount', '150'], ['selectionMode', 'products'], ['member-0-productId', 'gid://shopify/Product/1'],
    ]))).resolves.toBeUndefined()
  })

  it('creates the Shopify discount record with UTC dates and the function-config metafield, then saves', async () => {
    const shopifyQuerySpy = vi.spyOn(shopifyClient, 'shopifyQuery')
    shopifyQuerySpy.mockResolvedValueOnce({
      discountAutomaticAppCreate: {
        automaticAppDiscount: { discountId: 'gid://shopify/DiscountAutomaticApp/99' },
        userErrors: [],
      },
    })
    const saveSpy = vi.spyOn(timeConfigLib, 'saveTimeDiscountsConfig').mockResolvedValue(undefined)
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [] })

    await createTimeDiscount(formData([
      ['name', 'Flash'], ['title', 'Flash Sale'], ['startsAt', '2026-07-01T12:00'], ['endsAt', '2026-07-02T12:00'],
      ['pricingMode', 'percent'], ['amount', '20'], ['selectionMode', 'products'], ['member-0-productId', 'gid://shopify/Product/1'],
    ]))

    expect(shopifyQuerySpy).toHaveBeenCalledWith(
      expect.stringContaining('discountAutomaticAppCreate'),
      expect.objectContaining({
        automaticAppDiscount: expect.objectContaining({
          title: 'Flash Sale',
          functionHandle: 'time-based-discount',
          discountClasses: ['PRODUCT'],
          startsAt: '2026-07-01T11:00:00.000Z',
          endsAt: '2026-07-02T11:00:00.000Z',
          metafields: [expect.objectContaining({
            namespace: 'sparkly_time_discounts', key: 'function_config', type: 'json',
            value: JSON.stringify({ resolvedMembers: [{ productId: 'gid://shopify/Product/1' }], pricingMode: 'percent', amount: 20 }),
          })],
        }),
      }),
    )
    expect(saveSpy).toHaveBeenCalledWith({
      discounts: [expect.objectContaining({
        name: 'Flash', title: 'Flash Sale', shopifyDiscountId: 'gid://shopify/DiscountAutomaticApp/99', pricingMode: 'percent', amount: 20,
        selection: { mode: 'products', members: [{ productId: 'gid://shopify/Product/1' }] },
        resolvedMembers: [{ productId: 'gid://shopify/Product/1' }],
      })],
    })
  })

  it('creates a collections-mode discount, resolving members from the collection', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      discountAutomaticAppCreate: { automaticAppDiscount: { discountId: 'gid://shopify/DiscountAutomaticApp/99' }, userErrors: [] },
    })
    const saveSpy = vi.spyOn(timeConfigLib, 'saveTimeDiscountsConfig').mockResolvedValue(undefined)
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [] })
    const collectionsLib = await import('@/lib/collections')
    vi.spyOn(collectionsLib, 'resolveCollectionMembers').mockResolvedValue([{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }])
    vi.spyOn(productsLib, 'getMemberInfo').mockResolvedValue([
      { productId: 'gid://shopify/Product/1', title: 'A', price: 10, handle: 'a', imageUrl: null },
      { productId: 'gid://shopify/Product/2', title: 'B', price: 10, handle: 'b', imageUrl: null },
    ])

    await createTimeDiscount(formData([
      ['name', 'Flash'], ['title', 'Flash Sale'], ['startsAt', '2026-01-01T00:00'], ['endsAt', '2026-01-02T00:00'],
      ['pricingMode', 'percent'], ['amount', '20'], ['selectionMode', 'collections'], ['collectionId', 'gid://shopify/Collection/1'],
    ]))

    expect(saveSpy).toHaveBeenCalledWith({
      discounts: [expect.objectContaining({
        selection: { mode: 'collections', collectionIds: ['gid://shopify/Collection/1'] },
        resolvedMembers: [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/2' }],
      })],
    })
  })

  it('rejects a member already claimed by the existing tiered-discount system', async () => {
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({
      discounts: [{ discountId: 'disc_1', name: 'X', title: 'X', status: 'live', pricingMode: 'percent', members: [{ productId: 'gid://shopify/Product/1' }], tiers: [] }],
    })
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [] })

    await expect(createTimeDiscount(formData([
      ['name', 'N'], ['title', 'T'], ['startsAt', '2026-01-01T00:00'], ['endsAt', '2026-01-02T00:00'],
      ['pricingMode', 'percent'], ['amount', '10'], ['selectionMode', 'products'], ['member-0-productId', 'gid://shopify/Product/1'],
    ]))).rejects.toThrow('already belongs to another discount')
  })

  it('throws when Shopify reports userErrors creating the discount record', async () => {
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      discountAutomaticAppCreate: { automaticAppDiscount: null, userErrors: [{ field: ['startsAt'], message: 'Invalid date' }] },
    })
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [] })
    await expect(createTimeDiscount(formData([
      ['name', 'N'], ['title', 'T'], ['startsAt', '2026-01-01T00:00'], ['endsAt', '2026-01-02T00:00'],
      ['pricingMode', 'percent'], ['amount', '10'], ['selectionMode', 'products'], ['member-0-productId', 'gid://shopify/Product/1'],
    ]))).rejects.toThrow('Invalid date')
  })

  it('rejects a discount whose resolvedMembers would not fit in a single function_config metafield', async () => {
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [] })

    // Compute exactly how many members are needed to exceed the 9500-byte
    // safety threshold, rather than guessing a round number — this keeps
    // the test honest if the guard's margin or the GID shape ever changes.
    let memberCount = 0
    let byteLength = 0
    do {
      memberCount++
      const resolvedMembers = Array.from({ length: memberCount }, (_, n) => ({ productId: `gid://shopify/Product/${1000000 + n}` }))
      byteLength = new TextEncoder().encode(JSON.stringify({ resolvedMembers, pricingMode: 'percent', amount: 20 })).length
    } while (byteLength <= 9500)

    const formEntries: [string, string][] = [
      ['name', 'Big'], ['title', 'Big Sale'], ['startsAt', '2026-01-01T00:00'], ['endsAt', '2026-01-02T00:00'],
      ['pricingMode', 'percent'], ['amount', '20'], ['selectionMode', 'products'],
    ]
    for (let n = 0; n < memberCount; n++) {
      formEntries.push([`member-${n}-productId`, `gid://shopify/Product/${1000000 + n}`])
    }

    await expect(createTimeDiscount(formData(formEntries))).rejects.toThrow(/too many products\/variants.*split it into multiple/)
  })

  it('does not reject a normal-sized resolvedMembers list', async () => {
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [] })
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      discountAutomaticAppCreate: { automaticAppDiscount: { discountId: 'gid://shopify/DiscountAutomaticApp/99' }, userErrors: [] },
    })
    vi.spyOn(timeConfigLib, 'saveTimeDiscountsConfig').mockResolvedValue(undefined)

    await expect(createTimeDiscount(formData([
      ['name', 'Small'], ['title', 'Small Sale'], ['startsAt', '2026-01-01T00:00'], ['endsAt', '2026-01-02T00:00'],
      ['pricingMode', 'percent'], ['amount', '20'], ['selectionMode', 'products'], ['member-0-productId', 'gid://shopify/Product/1'],
    ]))).resolves.toBeUndefined()
  })
})

describe('updateTimeDiscountSelection', () => {
  it('updates the Shopify record\'s function-config metafield and clears/syncs product metafields', async () => {
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [{ ...existingDiscount }] })
    vi.spyOn(timeConfigLib, 'saveTimeDiscountsConfig').mockResolvedValue(undefined)
    const shopifyQuerySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ discountAutomaticAppUpdate: { userErrors: [] } })
    const clearSpy = vi.spyOn(metafieldSync, 'clearTimeDiscountMetafields')
    const syncSpy = vi.spyOn(metafieldSync, 'syncTimeDiscountMetafields')

    await updateTimeDiscountSelection('time_disc_1', formData([['selectionMode', 'products'], ['member-0-productId', 'gid://shopify/Product/2']]))

    expect(shopifyQuerySpy).toHaveBeenCalledWith(
      expect.stringContaining('discountAutomaticAppUpdate'),
      expect.objectContaining({
        id: 'gid://shopify/DiscountAutomaticApp/1',
        automaticAppDiscount: expect.objectContaining({
          metafields: [expect.objectContaining({ value: JSON.stringify({ resolvedMembers: [{ productId: 'gid://shopify/Product/2' }], pricingMode: 'percent', amount: 20 }) })],
        }),
      }),
    )
    expect(clearSpy).toHaveBeenCalledWith([{ productId: 'gid://shopify/Product/1' }])
    expect(syncSpy).toHaveBeenCalled()
  })

  it('does not save the local config when the Shopify update fails, so the two never drift out of sync', async () => {
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [{ ...existingDiscount }] })
    const saveSpy = vi.spyOn(timeConfigLib, 'saveTimeDiscountsConfig').mockResolvedValue(undefined)
    vi.spyOn(shopifyClient, 'shopifyQuery').mockRejectedValue(new Error('network down'))

    await expect(
      updateTimeDiscountSelection('time_disc_1', formData([['selectionMode', 'products'], ['member-0-productId', 'gid://shopify/Product/2']])),
    ).rejects.toThrow('network down')

    expect(saveSpy).not.toHaveBeenCalled()
  })
})

describe('updateTimeDiscountSchedule', () => {
  it('updates dates (converted to UTC), pricing mode, and amount on both the local config and the Shopify record', async () => {
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [existingDiscount] })
    const saveSpy = vi.spyOn(timeConfigLib, 'saveTimeDiscountsConfig').mockResolvedValue(undefined)
    const shopifyQuerySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ discountAutomaticAppUpdate: { userErrors: [] } })

    await updateTimeDiscountSchedule('time_disc_1', formData([['startsAt', '2026-07-01T12:00'], ['endsAt', '2026-07-02T12:00'], ['pricingMode', 'fixed'], ['amount', '5']]))

    expect(saveSpy).toHaveBeenCalledWith({
      discounts: [expect.objectContaining({ startsAt: '2026-07-01T12:00', endsAt: '2026-07-02T12:00', pricingMode: 'fixed', amount: 5 })],
    })
    expect(shopifyQuerySpy).toHaveBeenCalledWith(
      expect.stringContaining('discountAutomaticAppUpdate'),
      expect.objectContaining({
        id: 'gid://shopify/DiscountAutomaticApp/1',
        automaticAppDiscount: expect.objectContaining({ startsAt: '2026-07-01T11:00:00.000Z', endsAt: '2026-07-02T11:00:00.000Z' }),
      }),
    )
  })
})

describe('updateTimeDiscountTitle', () => {
  it('updates the title locally and on the Shopify record', async () => {
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [existingDiscount] })
    const saveSpy = vi.spyOn(timeConfigLib, 'saveTimeDiscountsConfig').mockResolvedValue(undefined)
    const shopifyQuerySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ discountAutomaticAppUpdate: { userErrors: [] } })

    await updateTimeDiscountTitle('time_disc_1', formData([['title', 'New Title']]))

    expect(saveSpy).toHaveBeenCalledWith({ discounts: [expect.objectContaining({ title: 'New Title' })] })
    expect(shopifyQuerySpy).toHaveBeenCalledWith(
      expect.stringContaining('discountAutomaticAppUpdate'),
      expect.objectContaining({ id: 'gid://shopify/DiscountAutomaticApp/1', automaticAppDiscount: { title: 'New Title' } }),
    )
  })
})

describe('deleteTimeDiscount', () => {
  it('removes the discount, deletes the Shopify record, and clears product metafields', async () => {
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [existingDiscount] })
    const saveSpy = vi.spyOn(timeConfigLib, 'saveTimeDiscountsConfig').mockResolvedValue(undefined)
    const shopifyQuerySpy = vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({ discountAutomaticDelete: { userErrors: [] } })
    const clearSpy = vi.spyOn(metafieldSync, 'clearTimeDiscountMetafields')

    await deleteTimeDiscount('time_disc_1')

    expect(saveSpy).toHaveBeenCalledWith({ discounts: [] })
    expect(shopifyQuerySpy).toHaveBeenCalledWith(expect.stringContaining('discountAutomaticDelete'), { id: 'gid://shopify/DiscountAutomaticApp/1' })
    expect(clearSpy).toHaveBeenCalledWith([{ productId: 'gid://shopify/Product/1' }])
  })

  it('does not remove the discount from local config when the Shopify delete fails', async () => {
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [{ ...existingDiscount }] })
    const saveSpy = vi.spyOn(timeConfigLib, 'saveTimeDiscountsConfig').mockResolvedValue(undefined)
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      discountAutomaticDelete: { userErrors: [{ field: [], message: 'Something went wrong' }] },
    })

    await expect(deleteTimeDiscount('time_disc_1')).rejects.toThrow('Something went wrong')

    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('treats a "not found" delete error as a successful no-op, so a retry after a partial failure still succeeds', async () => {
    vi.spyOn(timeConfigLib, 'getTimeDiscountsConfig').mockResolvedValue({ discounts: [{ ...existingDiscount }] })
    const saveSpy = vi.spyOn(timeConfigLib, 'saveTimeDiscountsConfig').mockResolvedValue(undefined)
    vi.spyOn(shopifyClient, 'shopifyQuery').mockResolvedValue({
      discountAutomaticDelete: { userErrors: [{ field: ['id'], message: 'Discount does not exist' }] },
    })

    await expect(deleteTimeDiscount('time_disc_1')).resolves.toBeUndefined()

    expect(saveSpy).toHaveBeenCalledWith({ discounts: [] })
  })
})
