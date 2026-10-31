import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { saveDiscount } from '@/actions/saveDiscount'
import { redirect } from 'next/navigation'
import { ensureTierDiscount } from '@/lib/tierDiscount'
import { syncDiscountRecord } from '@/flash/discountRecord'
import { getTimeDiscountsConfig, type TimeDiscount } from '@/timeDiscounts/config'
import type { Config, Discount } from '@/lib/config'

/**
 * The one save of the tier form, run for real (its reading, its checks, its order) against fakes of the
 * shop. These cover what the old per-section actions' tests covered.
 */
const shop = vi.hoisted(() => ({
  getConfig: vi.fn(),
  saveConfig: vi.fn(),
  syncDiscountMetafields: vi.fn(),
  clearDiscountMetafields: vi.fn(),
  getMemberInfo: vi.fn(),
}))
vi.mock('@/lib/config', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/config')>()), getConfig: shop.getConfig, saveConfig: shop.saveConfig }))
vi.mock('@/lib/product-tiers', () => ({ syncDiscountMetafields: shop.syncDiscountMetafields, clearDiscountMetafields: shop.clearDiscountMetafields }))
vi.mock('@/lib/products', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/products')>()), getMemberInfo: shop.getMemberInfo }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/tierDiscount', () => ({ ensureTierDiscount: vi.fn() }))
vi.mock('@/lib/shop', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/shop')>()), getShopTimezone: vi.fn(async () => 'Europe/London') }))
vi.mock('@/lib/shopify-client', () => ({ shopifyQuery: vi.fn() }))
vi.mock('@/timeDiscounts/config', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/timeDiscounts/config')>()), getTimeDiscountsConfig: vi.fn() }))
vi.mock('@/flash/discountRecord', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/flash/discountRecord')>()), syncDiscountRecord: vi.fn() }))

const P1 = 'gid://shopify/Product/1'
const P2 = 'gid://shopify/Product/2'
const FUTURE = { startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59' }
const RECORD_ID = 'gid://shopify/DiscountAutomaticNode/7'

const info = (productId: string, price: number, variantId?: string) => ({ productId, variantId, title: productId, productTitle: productId, price, handle: 'h', imageUrl: null })

function discountOf(over: Partial<Discount> = {}): Discount {
  return { discountId: 'disc_1', name: 'Soup', title: 'Soup Sale', status: 'draft', pricingMode: 'percent', members: [{ productId: P1 }], tiers: [{ minQty: 5, percentOff: 10 }], ...over }
}

function timeDiscountOf(over: Partial<TimeDiscount> = {}): TimeDiscount {
  return {
    discountId: 'time_1', shopifyDiscountId: 'gid://shopify/DiscountAutomaticNode/3', name: 'Weekend', title: 'Weekend sale', startsAt: '2026-11-10T09:00', endsAt: '2026-11-11T09:00',
    kind: 'perProduct', items: [{ productId: P1, pricingMode: 'percent', amount: 10 }], ...over,
  }
}

function form(fields: Record<string, string> = {}, members: { productId: string; variantId?: string }[] = [{ productId: P1 }]): FormData {
  const formData = new FormData()
  formData.set('name', 'Soup')
  members.forEach((member, index) => {
    formData.set(`member-${index}-productId`, member.productId)
    if (member.variantId) formData.set(`member-${index}-variantId`, member.variantId)
  })
  formData.set('tier-0-minQty', '5')
  formData.set('tier-0-percentOff', '10')
  for (const [name, value] of Object.entries(fields)) formData.set(name, value)
  return formData
}

function setup(discounts: Discount[] = [], memberPrices: [string, number][] = [[P1, 1.49]]) {
  const config: Config = { discounts }
  shop.getConfig.mockResolvedValue(config)
  shop.saveConfig.mockReset().mockResolvedValue(undefined)
  shop.syncDiscountMetafields.mockReset().mockResolvedValue(undefined)
  shop.clearDiscountMetafields.mockReset().mockResolvedValue(undefined)
  shop.getMemberInfo.mockResolvedValue(memberPrices.map(([productId, price]) => info(productId, price)))
  return { saveSpy: shop.saveConfig, syncSpy: shop.syncDiscountMetafields, clearSpy: shop.clearDiscountMetafields }
}

const save = (formData: FormData) => saveDiscount(null, formData)

beforeEach(() => {
  vi.mocked(redirect).mockClear()
  vi.mocked(ensureTierDiscount).mockReset()
  vi.mocked(ensureTierDiscount).mockResolvedValue('exists')
  vi.mocked(syncDiscountRecord).mockReset()
  vi.mocked(syncDiscountRecord).mockResolvedValue(RECORD_ID)
  vi.mocked(getTimeDiscountsConfig).mockResolvedValue({ discounts: [] })
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-01T10:00:00Z')) // 10:00 in London (summer time ended on 25 October)
})
afterEach(() => vi.useRealTimers())

describe('the style of a discount', () => {
  it('is saved with the discount from the four fields of the Design card', async () => {
    const { saveSpy } = setup()
    await save(form({ 'style-themeColor': '#e63946', 'style-backgroundColor': '#ffffff', 'style-cornerRadius': '4', 'style-priceSize': '30' }))
    expect(saveSpy.mock.calls[0][0].discounts[0].style).toEqual({ themeColor: '#E63946', backgroundColor: '#FFFFFF', cornerRadius: 4, priceSize: 30 })
  })

  it('is saved with the Design card\'s defaults when the card was left alone (or the fields are missing)', async () => {
    const { saveSpy } = setup()
    await save(form())
    expect(saveSpy.mock.calls[0][0].discounts[0].style).toEqual({ themeColor: '#0055C7', backgroundColor: '#F5EFE1', cornerRadius: 12, priceSize: 24 })
  })

  it('replaces a value that is not a colour or a number by its default instead of storing it', async () => {
    const { saveSpy } = setup()
    await save(form({ 'style-themeColor': 'red;}</style>', 'style-priceSize': 'huge' }))
    expect(saveSpy.mock.calls[0][0].discounts[0].style).toMatchObject({ themeColor: '#0055C7', priceSize: 24 })
  })
})

describe('saving a new discount', () => {
  it('makes sure the checkout discount exists first and, when it cannot, shows why and saves nothing', async () => {
    const { saveSpy } = setup()
    vi.mocked(ensureTierDiscount).mockRejectedValue(new Error('The tier discount Function is not deployed'))
    expect(await save(form())).toEqual({ error: 'The tier discount Function is not deployed' })
    expect(saveSpy).not.toHaveBeenCalled()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('creates a draft titled with its name, with the parsed tiers, and goes to its page', async () => {
    const { saveSpy } = setup()
    await save(form())
    expect(saveSpy).toHaveBeenCalledWith({
      discounts: [{ discountId: expect.stringMatching(/^disc_/), name: 'Soup', title: 'Soup', status: 'draft', pricingMode: 'percent', members: [{ productId: P1 }], tiers: [{ minQty: 5, percentOff: 10 }], style: { themeColor: '#0055C7', backgroundColor: '#F5EFE1', cornerRadius: 12, priceSize: 24 } }],
    })
    expect(redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/discounts\/disc_/))
  })

  it('creates a discount mixing a whole product and a specific variant', async () => {
    const { saveSpy } = setup([], [[P1, 1.49], [P2, 1.49]])
    await save(form({}, [{ productId: P1 }, { productId: P2, variantId: 'gid://shopify/ProductVariant/20' }]))
    expect(saveSpy.mock.calls[0][0].discounts[0].members).toEqual([{ productId: P1 }, { productId: P2, variantId: 'gid://shopify/ProductVariant/20' }])
  })

  it('refuses fixed prices and anchor prices for products with different prices, but allows plain percentages', async () => {
    const { saveSpy } = setup([], [[P1, 1.49], [P2, 1.59]])
    const two = [{ productId: P1 }, { productId: P2 }]
    expect(await save(form({ pricingMode: 'fixed', 'tier-0-fixedPrice': '1.20' }, two))).toEqual({ error: expect.stringMatching(/different prices/) })
    expect(await save(form({ 'tier-0-anchorPrice': '10' }, two))).toEqual({ error: expect.stringMatching(/different prices/) })
    expect(saveSpy).not.toHaveBeenCalled()
    await save(form({}, two))
    expect(saveSpy).toHaveBeenCalledTimes(1)
  })

  it('saves a draft that holds a product another live discount has, since only a live discount keeps a product', async () => {
    const { saveSpy } = setup([discountOf({ discountId: 'disc_x', name: 'X', status: 'live' })])
    await save(form())
    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(saveSpy.mock.calls[0][0].discounts[1].status).toBe('draft')
  })

  it('refuses Go live when another live discount has the product, naming the product and that discount, and saves nothing', async () => {
    const { saveSpy, syncSpy } = setup([discountOf({ discountId: 'disc_x', name: 'Spring', status: 'live' })])
    expect(await save(form({ goLive: 'on' }))).toEqual({
      error: `"${P1}" is already in live discount "Spring". A product can only be in one live discount: take "Spring" offline or remove the product here.`,
    })
    expect(saveSpy).not.toHaveBeenCalled()
    expect(syncSpy).not.toHaveBeenCalled()
  })

  it('goes live when the only other discount with the product is a draft or offline', async () => {
    const { saveSpy } = setup([discountOf({ discountId: 'disc_x', name: 'Autumn', status: 'draft' })])
    await save(form({ goLive: 'on' }))
    expect(saveSpy.mock.calls[0][0].discounts[1].status).toBe('live')
  })

  it('refuses to save a live discount that shares a product with another live one, but not a live discount that is only itself', async () => {
    const { saveSpy } = setup([discountOf({ discountId: 'disc_x', name: 'Spring', status: 'live' }), discountOf({ discountId: 'disc_1', name: 'Soup', status: 'live' })])
    expect(await save(form({ discountId: 'disc_1' }))).toEqual({ error: expect.stringMatching(/already in live discount "Spring"/) })
    expect(saveSpy).not.toHaveBeenCalled()
    const alone = setup([discountOf({ discountId: 'disc_1', name: 'Soup', status: 'live' })])
    await save(form({ discountId: 'disc_1' }))
    expect(alone.saveSpy).toHaveBeenCalledTimes(1)
  })

  it('is live with Go live, and puts the prices on the storefront', async () => {
    const { saveSpy, syncSpy } = setup()
    await save(form({ goLive: 'on' }))
    expect(saveSpy.mock.calls[0][0].discounts[0].status).toBe('live')
    expect(syncSpy).toHaveBeenCalledTimes(1)
  })
})

describe('saving an existing discount', () => {
  it('refuses products at different prices for a stored fixed-price discount and for stored anchor prices, and allows plain percentages', async () => {
    const prices: [string, number][] = [[P1, 1.49], [P2, 1.59]]
    const two = [{ productId: P1 }, { productId: P2 }]
    const fixed = setup([discountOf({ pricingMode: 'fixed', tiers: [{ minQty: 3, fixedPrice: 1.2 }] })], prices)
    expect(await save(form({ discountId: 'disc_1', pricingMode: 'fixed', 'tier-0-minQty': '3', 'tier-0-fixedPrice': '1.20' }, two))).toEqual({ error: expect.stringMatching(/different prices/) })
    expect(fixed.saveSpy).not.toHaveBeenCalled()
    const plain = setup([discountOf()], prices)
    await save(form({ discountId: 'disc_1' }, two))
    expect(plain.saveSpy).toHaveBeenCalledTimes(1)
  })

  it('clears the metafields of a product removed from a live discount and re-syncs the rest', async () => {
    const { clearSpy, syncSpy } = setup([discountOf({ status: 'live', members: [{ productId: P1 }, { productId: P2 }] })])
    await save(form({ discountId: 'disc_1' }, [{ productId: P1 }]))
    expect(clearSpy).toHaveBeenCalledWith([{ productId: P2 }])
    expect(syncSpy).toHaveBeenCalledTimes(1)
  })

  it('goes live with Go live and goes offline with Take offline, clearing the storefront', async () => {
    const live = setup([discountOf()])
    await save(form({ discountId: 'disc_1', goLive: 'on' }))
    expect(live.syncSpy).toHaveBeenCalledTimes(1)
    const offline = setup([discountOf({ status: 'live' })])
    await save(form({ discountId: 'disc_1', takeOffline: 'on' }))
    expect(offline.saveSpy.mock.calls[0][0].discounts[0].status).toBe('draft')
    expect(offline.clearSpy).toHaveBeenCalledWith([{ productId: P1 }])
  })

  it('syncs the storefront when High Demand is switched on for a live discount, and not for a draft', async () => {
    const live = setup([discountOf({ status: 'live' })])
    await save(form({ discountId: 'disc_1', highDemand: 'on' }))
    expect(live.saveSpy.mock.calls[0][0].discounts[0].highDemand).toBe(true)
    expect(live.syncSpy).toHaveBeenCalledTimes(1)
    const draft = setup([discountOf()])
    await save(form({ discountId: 'disc_1', highDemand: 'on' }))
    expect(draft.syncSpy).not.toHaveBeenCalled()
  })
})

describe('saving a flash sale', () => {
  const flash = (extra: Record<string, string> = {}) => ({ flashEnabled: 'on', flashStartsAt: FUTURE.startsAt, flashEndsAt: FUTURE.endsAt, flashShowTeaser: 'on', ...extra })

  it('saves the window and the teaser flag on a draft and creates no Shopify discount', async () => {
    const { saveSpy } = setup()
    await save(form(flash()))
    expect(saveSpy.mock.calls[0][0].discounts[0].flash).toEqual({ ...FUTURE, showTeaser: true })
    expect(syncDiscountRecord).not.toHaveBeenCalled()
  })

  it('refuses an end time that has passed, and asks for both times, before anything is saved', async () => {
    const { saveSpy } = setup()
    expect(await save(form(flash({ flashStartsAt: '2026-10-01T09:00', flashEndsAt: '2026-10-02T09:00' })))).toEqual({ error: 'The end time has already passed. Choose a later end time.' })
    expect(await save(form(flash({ flashEndsAt: '' })))).toEqual({ error: 'Choose a start and an end time.' })
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('saves High Demand only when ticked, and no flash when its switch is off', async () => {
    const { saveSpy } = setup()
    await save(form({ ...FUTURE, flashStartsAt: FUTURE.startsAt, flashEndsAt: FUTURE.endsAt }))
    const saved = saveSpy.mock.calls[0][0].discounts[0]
    expect('flash' in saved && saved.flash).toBeFalsy()
    expect(saved.highDemand).toBeUndefined()
  })

  it('creates the Shopify discount when going live, stores its id, converts London time to UTC and syncs the storefront', async () => {
    const { saveSpy, syncSpy } = setup()
    await save(form(flash({ goLive: 'on' })))
    expect(syncDiscountRecord).toHaveBeenCalledWith(expect.objectContaining({ title: 'Soup', status: 'live', flash: FUTURE, shopifyDiscountId: undefined, nowLocal: '2026-11-01T10:00' }))
    expect(saveSpy.mock.calls[0][0].discounts[0].flash).toEqual({ ...FUTURE, showTeaser: true, shopifyDiscountId: RECORD_ID })
    expect(syncSpy).toHaveBeenCalledTimes(1)
    const { convertToUtc } = vi.mocked(syncDiscountRecord).mock.calls[0][0]
    expect(convertToUtc('2026-11-27T09:00')).toBe('2026-11-27T09:00:00.000Z')
  })

  it('refuses to go live as a flash sale while a time-based discount that is upcoming or running has the product, saving and creating nothing', async () => {
    const { saveSpy } = setup()
    vi.mocked(getTimeDiscountsConfig).mockResolvedValue({ discounts: [timeDiscountOf()] })
    expect(await save(form(flash({ goLive: 'on' })))).toEqual({
      error: `"${P1}" is already in time-based discount "Weekend sale", which is upcoming or running. A flash sale cannot share a product with it.`,
    })
    expect(syncDiscountRecord).not.toHaveBeenCalled()
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('goes live as a flash sale when the time-based discount with the product has expired', async () => {
    const { saveSpy } = setup()
    vi.mocked(getTimeDiscountsConfig).mockResolvedValue({ discounts: [timeDiscountOf({ startsAt: '2026-10-01T09:00', endsAt: '2026-10-02T09:00' })] })
    await save(form(flash({ goLive: 'on' })))
    expect(saveSpy).toHaveBeenCalledTimes(1)
  })

  it('shows Shopify\'s message and leaves everything as it was when the record is refused', async () => {
    const { saveSpy, syncSpy } = setup()
    vi.mocked(syncDiscountRecord).mockRejectedValue(new Error('Limit of 25 automatic discounts reached. Deactivate an existing discount to add a new one.'))
    expect(await save(form(flash({ goLive: 'on' })))).toEqual({ error: 'Limit of 25 automatic discounts reached. Deactivate an existing discount to add a new one.' })
    expect(saveSpy).not.toHaveBeenCalled()
    expect(syncSpy).not.toHaveBeenCalled()
  })

  it('makes no Shopify discount call for a discount that is not a flash sale', async () => {
    setup()
    await save(form({ goLive: 'on' }))
    expect(syncDiscountRecord).not.toHaveBeenCalled()
  })

  it('deletes the Shopify discount and its id when the discount is taken offline', async () => {
    const { saveSpy, clearSpy } = setup([discountOf({ status: 'live', flash: { ...FUTURE, showTeaser: true, shopifyDiscountId: RECORD_ID } })])
    vi.mocked(syncDiscountRecord).mockResolvedValue(undefined)
    await save(form({ ...flash(), discountId: 'disc_1', takeOffline: 'on' }))
    expect(syncDiscountRecord).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft', shopifyDiscountId: RECORD_ID }))
    expect(saveSpy.mock.calls[0][0].discounts[0].flash).toEqual({ ...FUTURE, showTeaser: true })
    expect(clearSpy).toHaveBeenCalledWith([{ productId: P1 }])
  })

  it('updates the Shopify discount and the storefront when the window of a live sale moves', async () => {
    const { saveSpy, syncSpy } = setup([discountOf({ status: 'live', flash: { ...FUTURE, showTeaser: true, shopifyDiscountId: RECORD_ID } })])
    await save(form({ ...flash({ flashEndsAt: '2026-12-05T23:59' }), discountId: 'disc_1' }))
    expect(syncDiscountRecord).toHaveBeenCalledWith(expect.objectContaining({ shopifyDiscountId: RECORD_ID, flash: { startsAt: FUTURE.startsAt, endsAt: '2026-12-05T23:59' } }))
    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(syncSpy).toHaveBeenCalledTimes(1)
  })

  it('deletes the Shopify discount and the flash sale when the switch is turned off on a live discount', async () => {
    const { saveSpy } = setup([discountOf({ status: 'live', flash: { ...FUTURE, showTeaser: true, shopifyDiscountId: RECORD_ID } })])
    vi.mocked(syncDiscountRecord).mockResolvedValue(undefined)
    await save(form({ discountId: 'disc_1' }))
    expect(syncDiscountRecord).toHaveBeenCalledWith(expect.objectContaining({ shopifyDiscountId: RECORD_ID, flash: undefined }))
    expect(saveSpy.mock.calls[0][0].discounts[0].flash).toBeUndefined()
  })

  it('creates the Shopify discount when the flash sale is switched on for a live discount', async () => {
    const { saveSpy } = setup([discountOf({ status: 'live' })])
    await save(form({ ...flash(), discountId: 'disc_1' }))
    expect(saveSpy.mock.calls[0][0].discounts[0].flash).toEqual({ ...FUTURE, showTeaser: true, shopifyDiscountId: RECORD_ID })
  })
})
