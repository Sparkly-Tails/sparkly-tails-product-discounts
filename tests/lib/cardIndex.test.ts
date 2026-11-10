import { describe, it, expect, vi } from 'vitest'
import {
  CARD_INDEX_TOOLS, buildCardIndexValue, listFlashWindows, mergeVariantIds, readNumericId, type CardIndex, type CardIndexTools,
} from '@/lib/cardIndex'
import { shopifyQuery } from '@/lib/shopify-client'
import type { Discount } from '@/lib/config'

vi.mock('@/lib/shopify-client', () => ({ shopifyQuery: vi.fn() }))

const live = (overrides: Partial<Discount>): Discount => ({
  discountId: 'disc_1', name: 'Tins', title: 'Tins', status: 'live', pricingMode: 'fixed', members: [], tiers: [{ minQty: 8, fixedPrice: 1.63 }, { minQty: 16, fixedPrice: 1.55 }], ...overrides,
})

// The real steps with the shop's timezone read and the zone conversion replaced: the window is the text read as UTC.
// Every product has the handle `product-<number>`, except product 404, which no longer exists.
const tools: CardIndexTools = {
  ...CARD_INDEX_TOOLS,
  readProductHandles: vi.fn(async ({ productIds }: { productIds: string[] }) => Object.fromEntries(productIds.filter((gid) => !gid.endsWith('/404')).map((gid) => [gid, 'product-' + gid.slice(gid.lastIndexOf('/') + 1)]))),
  readTimeZone: vi.fn(async () => 'Europe/London'),
  convertToUtc: (naive: string) => naive + ':00Z',
}

const read = async (discounts: Discount[]): Promise<CardIndex> => JSON.parse(await buildCardIndexValue({ discounts, tools }))

describe('readNumericId', () => {
  it('keeps the number of a Shopify id', () => {
    expect(readNumericId({ gid: 'gid://shopify/Product/123' })).toBe('123')
    expect(readNumericId({ gid: 'gid://shopify/ProductVariant/45' })).toBe('45')
  })
})

describe('mergeVariantIds', () => {
  it('adds a variant to the ones a product already has', () => {
    expect(mergeVariantIds({ current: [], variantId: '1' })).toEqual(['1'])
    expect(mergeVariantIds({ current: ['1'], variantId: '2' })).toEqual(['1', '2'])
  })

  it('is the whole product when a member has no variant, and stays so', () => {
    expect(mergeVariantIds({ current: ['1'], variantId: null })).toBeNull()
    expect(mergeVariantIds({ current: null, variantId: '2' })).toBeNull()
  })
})

describe('buildCardIndexValue', () => {
  it('lists live discounts only, never a draft', async () => {
    const index = await read([live({ discountId: 'a', members: [{ productId: 'gid://shopify/Product/1' }] }), live({ discountId: 'b', status: 'draft', members: [{ productId: 'gid://shopify/Product/2' }] })])
    expect(index.discounts).toHaveLength(1)
    expect(index.discounts[0].members).toEqual([{ productId: '1', handle: 'product-1', variantIds: null }])
  })

  it('has the tiers as they are, and only the fields a card needs', async () => {
    const index = await read([live({ name: 'Admin label', title: 'Customer title', members: [{ productId: 'gid://shopify/Product/1' }] })])
    expect(index.discounts[0]).toEqual({ discountId: 'disc_1', title: 'Customer title', popupFrequency: 'session', tiers: [{ minQty: 8, fixedPrice: 1.63 }, { minQty: 16, fixedPrice: 1.55 }], members: [{ productId: '1', handle: 'product-1', variantIds: null }], flash: null })
  })

  it('carries the discount id, as saved (the pop-up remembers per discount that it was shown)', async () => {
    const index = await read([live({ discountId: 'disc_77', members: [{ productId: 'gid://shopify/Product/1' }] })])
    expect(index.discounts[0].discountId).toBe('disc_77')
  })

  it('carries the customer title, or the name when the title is blank', async () => {
    const index = await read([
      live({ discountId: 'a', name: 'Admin label', title: 'Customer title', members: [{ productId: 'gid://shopify/Product/1' }] }),
      live({ discountId: 'b', name: 'Admin label', title: '', members: [{ productId: 'gid://shopify/Product/1' }] }),
    ])
    expect(index.discounts.map((entry) => entry.title)).toEqual(['Customer title', 'Admin label'])
  })

  it('carries the pop-up frequency: once per session unless the discount says every checkout press', async () => {
    const index = await read([
      live({ discountId: 'a', members: [{ productId: 'gid://shopify/Product/1' }] }),
      live({ discountId: 'b', popupFrequency: 'checkout', members: [{ productId: 'gid://shopify/Product/1' }] }),
    ])
    expect(index.discounts.map((entry) => entry.popupFrequency)).toEqual(['session', 'checkout'])
  })

  it('carries the look as background colour and corner radius only, and leaves the key out when the discount has none', async () => {
    const style = { backgroundColor: '#AABBCC', cornerRadius: 8, extra: 'x' } as unknown as Discount['style']
    const index = await read([
      live({ discountId: 'a', style, members: [{ productId: 'gid://shopify/Product/1' }] }),
      live({ discountId: 'b', members: [{ productId: 'gid://shopify/Product/1' }] }),
    ])
    expect(index.discounts[0].style).toEqual({ backgroundColor: '#AABBCC', cornerRadius: 8 })
    expect('style' in index.discounts[1]).toBe(false)
  })

  it('groups the variants of a product, in the order they were added', async () => {
    const index = await read([live({ members: [
      { productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/11' },
      { productId: 'gid://shopify/Product/2' },
      { productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/12' },
    ] })])
    expect(index.discounts[0].members).toEqual([{ productId: '1', handle: 'product-1', variantIds: ['11', '12'] }, { productId: '2', handle: 'product-2', variantIds: null }])
  })

  it('has the flash window as Unix seconds, from the shop timezone, for a flash sale', async () => {
    const index = await read([live({ members: [{ productId: 'gid://shopify/Product/1' }], flash: { startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', showTeaser: true } })])
    expect(index.discounts[0].flash).toEqual({ startsAtUnix: Date.UTC(2026, 10, 27, 9, 0) / 1000, endsAtUnix: Date.UTC(2026, 10, 30, 23, 59) / 1000 })
  })

  it('is an empty list when nothing is live', async () => {
    expect(await read([])).toEqual({ discounts: [] })
    expect(await read([live({ status: 'draft' })])).toEqual({ discounts: [] })
  })

  it('leaves out a product that no longer exists, because a card can only find a product by its handle', async () => {
    const index = await read([live({ members: [{ productId: 'gid://shopify/Product/404' }, { productId: 'gid://shopify/Product/5' }] })])
    expect(index.discounts[0].members).toEqual([{ productId: '5', handle: 'product-5', variantIds: null }])
  })

  it('asks for the handles of live discounts only, in one request, and none when nothing is live', async () => {
    const readProductHandles = vi.fn(async () => ({}))
    const spied = { ...tools, readProductHandles }
    await buildCardIndexValue({ discounts: [live({ members: [{ productId: 'gid://shopify/Product/1' }, { productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/2' }] }), live({ status: 'draft', members: [{ productId: 'gid://shopify/Product/9' }] })], tools: spied })
    expect(readProductHandles).toHaveBeenCalledTimes(1)
    expect(readProductHandles).toHaveBeenCalledWith(expect.objectContaining({ productIds: ['gid://shopify/Product/1'] }))
    readProductHandles.mockClear()
    await buildCardIndexValue({ discounts: [live({ status: 'draft' })], tools: spied })
    expect(readProductHandles).not.toHaveBeenCalled()
  })
})

describe('readProductHandles', () => {
  it('asks Shopify for the handles by id and answers by id, skipping what no longer exists', async () => {
    vi.mocked(shopifyQuery).mockResolvedValueOnce({ nodes: [{ id: 'gid://shopify/Product/1', handle: 'tuna' }, null] })
    const handles = await CARD_INDEX_TOOLS.readProductHandles({ productIds: ['gid://shopify/Product/1', 'gid://shopify/Product/2'], tools: CARD_INDEX_TOOLS })
    expect(handles).toEqual({ 'gid://shopify/Product/1': 'tuna' })
    expect(shopifyQuery).toHaveBeenCalledWith(expect.stringContaining('handle'), { ids: ['gid://shopify/Product/1', 'gid://shopify/Product/2'] })
  })

  it('asks at most 250 ids at a time', async () => {
    vi.mocked(shopifyQuery).mockReset()
    vi.mocked(shopifyQuery).mockResolvedValue({ nodes: [] })
    await CARD_INDEX_TOOLS.readProductHandles({ productIds: Array.from({ length: 251 }, (_, index) => 'gid://shopify/Product/' + index), tools: CARD_INDEX_TOOLS })
    expect(shopifyQuery).toHaveBeenCalledTimes(2)
  })
})

describe('listFlashWindows', () => {
  it('does not ask for the timezone when no live discount is a flash sale', async () => {
    const readTimeZone = vi.fn(async () => 'UTC')
    const windows = await listFlashWindows({ discounts: [live({}), live({ status: 'draft', flash: { startsAt: '2026-11-27T09:00', endsAt: '2026-11-28T09:00', showTeaser: false } })], tools: { ...tools, readTimeZone } })
    expect(windows).toEqual({})
    expect(readTimeZone).not.toHaveBeenCalled()
  })
})
