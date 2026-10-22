import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createDiscount, setDiscountStatus, deleteDiscount, updateDiscountTitle, updateDiscountFlash, updateDiscountHighDemand,
} from '@/actions/discountActions'
import * as configLib from '@/lib/config'
import * as productTiers from '@/lib/product-tiers'
import * as products from '@/lib/products'
import { redirect } from 'next/navigation'
import { syncDiscountRecord } from '@/flash/discountRecord'
import { fetchAvailabilityConfigs, isAvailableEverywhere } from '@/lib/discount-availability'
import type { Config, Discount } from '@/lib/config'

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/tierDiscount', () => ({ ensureTierDiscount: vi.fn(async () => 'exists') }))
vi.mock('@/lib/shop', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/shop')>()), getShopTimezone: vi.fn(async () => 'Europe/London') }))
vi.mock('@/lib/shopify-client', () => ({ shopifyQuery: vi.fn() }))
vi.mock('@/lib/discount-availability', () => ({ fetchAvailabilityConfigs: vi.fn(), isAvailableEverywhere: vi.fn() }))
vi.mock('@/flash/discountRecord', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/flash/discountRecord')>()), syncDiscountRecord: vi.fn() }))

const FUTURE = { startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59' }
const RECORD_ID = 'gid://shopify/DiscountAutomaticNode/7'

function buildDiscount(over: Partial<Discount> = {}): Discount {
  return {
    discountId: 'disc_1', name: 'Soup', title: 'Soup Sale', status: 'draft', pricingMode: 'percent',
    members: [{ productId: 'gid://shopify/Product/1' }], tiers: [{ minQty: 5, percentOff: 10 }], ...over,
  }
}

function flashForm(fields: Record<string, string>): FormData {
  const formData = new FormData()
  for (const [name, value] of Object.entries(fields)) formData.set(name, value)
  return formData
}

function createForm(extra: Record<string, string> = {}): FormData {
  return flashForm({ name: 'Soup', title: 'Soup Sale', 'member-0-productId': 'gid://shopify/Product/1', 'tier-0-minQty': '5', 'tier-0-percentOff': '10', ...extra })
}

function setup(discount: Discount) {
  const config: Config = { discounts: [discount] }
  vi.spyOn(configLib, 'getConfig').mockResolvedValue(config)
  const saveSpy = vi.spyOn(configLib, 'saveConfig').mockResolvedValue()
  const syncSpy = vi.spyOn(productTiers, 'syncDiscountMetafields').mockResolvedValue()
  const clearSpy = vi.spyOn(productTiers, 'clearDiscountMetafields').mockResolvedValue()
  vi.spyOn(products, 'getMemberInfo').mockResolvedValue([
    { productId: 'gid://shopify/Product/1', variantId: undefined, title: 'Soup', price: 1.49, handle: 'soup', imageUrl: null },
  ])
  return { config, saveSpy, syncSpy, clearSpy }
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.mocked(redirect).mockClear()
  vi.mocked(syncDiscountRecord).mockReset()
  vi.mocked(syncDiscountRecord).mockResolvedValue(RECORD_ID)
  vi.mocked(fetchAvailabilityConfigs).mockResolvedValue({ productConfig: { discounts: [] }, timeConfig: { discounts: [] } } as never)
  vi.mocked(isAvailableEverywhere).mockReturnValue(true)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-01T10:00:00Z')) // 10:00 in London (summer time ended on 25 October)
})

afterEach(() => vi.useRealTimers())

describe('createDiscount with a flash sale', () => {
  it('saves the flash window and the teaser flag, and creates no Shopify discount while it is a draft', async () => {
    const { saveSpy } = setup(buildDiscount())
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })
    await createDiscount(createForm({ flashEnabled: 'on', flashStartsAt: FUTURE.startsAt, flashEndsAt: FUTURE.endsAt, flashShowTeaser: 'on' }))
    expect(saveSpy).toHaveBeenCalledWith({ discounts: [expect.objectContaining({ status: 'draft', flash: { ...FUTURE, showTeaser: true } })] })
    expect(syncDiscountRecord).not.toHaveBeenCalled()
  })

  it('refuses an end time that has already passed, before anything is saved', async () => {
    const { saveSpy } = setup(buildDiscount())
    await expect(createDiscount(createForm({ flashEnabled: 'on', flashStartsAt: '2026-10-01T09:00', flashEndsAt: '2026-10-02T09:00' }))).rejects.toThrow('The end time has already passed. Choose a later end time.')
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('asks for both times when the switch is on and one is empty', async () => {
    const { saveSpy } = setup(buildDiscount())
    await expect(createDiscount(createForm({ flashEnabled: 'on', flashStartsAt: FUTURE.startsAt }))).rejects.toThrow('Choose a start and an end time.')
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('saves the High Demand flag only when it is checked, and no flash key when the switch is off', async () => {
    const { saveSpy } = setup(buildDiscount())
    vi.spyOn(configLib, 'getConfig').mockResolvedValue({ discounts: [] })
    await createDiscount(createForm({ highDemand: 'on' }))
    const saved = saveSpy.mock.calls[0][0].discounts[0]
    expect(saved.highDemand).toBe(true)
    expect(saved).not.toHaveProperty('flash')
  })
})

describe('setDiscountStatus for a flash discount', () => {
  it('creates the Shopify discount when going live, stores its id and syncs the product metafields', async () => {
    const { saveSpy, syncSpy } = setup(buildDiscount({ flash: { ...FUTURE, showTeaser: true } }))
    await setDiscountStatus('disc_1', 'live')
    expect(syncDiscountRecord).toHaveBeenCalledWith(expect.objectContaining({
      discountId: 'disc_1', title: 'Soup Sale', status: 'live', flash: FUTURE, shopifyDiscountId: undefined, nowLocal: '2026-11-01T10:00',
    }))
    expect(saveSpy).toHaveBeenCalledWith({ discounts: [expect.objectContaining({ status: 'live', flash: { ...FUTURE, showTeaser: true, shopifyDiscountId: RECORD_ID } })] })
    expect(syncSpy).toHaveBeenCalledTimes(1)
  })

  it('converts the shop-local times to UTC for the record (London is on GMT in November)', async () => {
    setup(buildDiscount({ flash: { ...FUTURE, showTeaser: true } }))
    await setDiscountStatus('disc_1', 'live')
    const { convertToUtc } = vi.mocked(syncDiscountRecord).mock.calls[0][0]
    expect(convertToUtc('2026-11-27T09:00')).toBe('2026-11-27T09:00:00.000Z')
  })

  it('refuses to go live when a product now belongs to another discount, saving and creating nothing', async () => {
    const { saveSpy } = setup(buildDiscount({ flash: { ...FUTURE, showTeaser: true } }))
    vi.mocked(isAvailableEverywhere).mockReturnValue(false)
    await expect(setDiscountStatus('disc_1', 'live')).rejects.toThrow(/already belongs to another discount/)
    expect(syncDiscountRecord).not.toHaveBeenCalled()
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('refuses to go live when the end time has passed', async () => {
    const { saveSpy } = setup(buildDiscount({ flash: { startsAt: '2026-10-01T09:00', endsAt: '2026-10-02T09:00', showTeaser: true } }))
    await expect(setDiscountStatus('disc_1', 'live')).rejects.toThrow('The end time has already passed. Choose a later end time.')
    expect(syncDiscountRecord).not.toHaveBeenCalled()
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('leaves the stored discount unchanged and shows Shopify\'s message when the record is refused', async () => {
    const { saveSpy, syncSpy } = setup(buildDiscount({ flash: { ...FUTURE, showTeaser: true } }))
    vi.mocked(syncDiscountRecord).mockRejectedValue(new Error('Limit of 25 automatic discounts reached. Deactivate an existing discount to add a new one.'))
    await expect(setDiscountStatus('disc_1', 'live')).rejects.toThrow('Limit of 25 automatic discounts reached.')
    expect(saveSpy).not.toHaveBeenCalled()
    expect(syncSpy).not.toHaveBeenCalled()
  })

  it('deletes the Shopify discount and clears its id when the discount goes back to draft', async () => {
    const { saveSpy, clearSpy } = setup(buildDiscount({ status: 'live', flash: { ...FUTURE, showTeaser: true, shopifyDiscountId: RECORD_ID } }))
    vi.mocked(syncDiscountRecord).mockResolvedValue(undefined)
    await setDiscountStatus('disc_1', 'draft')
    expect(syncDiscountRecord).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft', shopifyDiscountId: RECORD_ID }))
    const saved = saveSpy.mock.calls[0][0].discounts[0]
    expect(saved.status).toBe('draft')
    expect(saved.flash).not.toHaveProperty('shopifyDiscountId')
    expect(clearSpy).toHaveBeenCalledTimes(1)
  })

  it('does not touch Shopify discounts for a discount that is not a flash sale', async () => {
    setup(buildDiscount())
    await setDiscountStatus('disc_1', 'live')
    expect(syncDiscountRecord).not.toHaveBeenCalled()
    expect(fetchAvailabilityConfigs).not.toHaveBeenCalled()
  })
})

describe('updateDiscountFlash', () => {
  it('saves a new window on a draft without creating a Shopify discount', async () => {
    const { saveSpy, syncSpy } = setup(buildDiscount())
    await updateDiscountFlash('disc_1', flashForm({ flashEnabled: 'on', flashStartsAt: FUTURE.startsAt, flashEndsAt: FUTURE.endsAt }))
    expect(saveSpy).toHaveBeenCalledWith({ discounts: [expect.objectContaining({ flash: { ...FUTURE, showTeaser: false } })] })
    expect(syncDiscountRecord).not.toHaveBeenCalled()
    expect(syncSpy).not.toHaveBeenCalled()
  })

  it('refuses a past end time before saving anything', async () => {
    const { saveSpy } = setup(buildDiscount())
    await expect(updateDiscountFlash('disc_1', flashForm({ flashEnabled: 'on', flashStartsAt: '2026-10-01T09:00', flashEndsAt: '2026-10-02T09:00' }))).rejects.toThrow('The end time has already passed.')
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('updates the Shopify discount and the product metafields when the window of a live sale changes', async () => {
    const { saveSpy, syncSpy } = setup(buildDiscount({ status: 'live', flash: { ...FUTURE, showTeaser: true, shopifyDiscountId: RECORD_ID } }))
    await updateDiscountFlash('disc_1', flashForm({ flashEnabled: 'on', flashStartsAt: '2026-12-01T09:00', flashEndsAt: '2026-12-02T09:00', flashShowTeaser: 'on' }))
    expect(syncDiscountRecord).toHaveBeenCalledWith(expect.objectContaining({ status: 'live', flash: { startsAt: '2026-12-01T09:00', endsAt: '2026-12-02T09:00' }, shopifyDiscountId: RECORD_ID }))
    expect(saveSpy).toHaveBeenCalledWith({ discounts: [expect.objectContaining({ flash: { startsAt: '2026-12-01T09:00', endsAt: '2026-12-02T09:00', showTeaser: true, shopifyDiscountId: RECORD_ID } })] })
    expect(syncSpy).toHaveBeenCalledTimes(1)
  })

  it('creates the Shopify discount when flash is switched on for a live discount', async () => {
    const { saveSpy } = setup(buildDiscount({ status: 'live' }))
    await updateDiscountFlash('disc_1', flashForm({ flashEnabled: 'on', flashStartsAt: FUTURE.startsAt, flashEndsAt: FUTURE.endsAt }))
    expect(syncDiscountRecord).toHaveBeenCalledWith(expect.objectContaining({ status: 'live', shopifyDiscountId: undefined }))
    expect(saveSpy.mock.calls[0][0].discounts[0].flash?.shopifyDiscountId).toBe(RECORD_ID)
  })

  it('deletes the Shopify discount and clears flash when the switch is turned off', async () => {
    const { saveSpy, syncSpy } = setup(buildDiscount({ status: 'live', flash: { ...FUTURE, showTeaser: true, shopifyDiscountId: RECORD_ID } }))
    vi.mocked(syncDiscountRecord).mockResolvedValue(undefined)
    await updateDiscountFlash('disc_1', flashForm({}))
    expect(syncDiscountRecord).toHaveBeenCalledWith(expect.objectContaining({ flash: undefined, shopifyDiscountId: RECORD_ID }))
    expect(saveSpy.mock.calls[0][0].discounts[0]).not.toHaveProperty('flash')
    expect(syncSpy).toHaveBeenCalledTimes(1)
  })

  it('keeps the stored discount unchanged when Shopify refuses the new window', async () => {
    const { saveSpy, syncSpy } = setup(buildDiscount({ status: 'live', flash: { ...FUTURE, showTeaser: true, shopifyDiscountId: RECORD_ID } }))
    vi.mocked(syncDiscountRecord).mockRejectedValue(new Error('Ends at must be after starts at.'))
    await expect(updateDiscountFlash('disc_1', flashForm({ flashEnabled: 'on', flashStartsAt: '2026-12-01T09:00', flashEndsAt: '2026-12-02T09:00' }))).rejects.toThrow('Ends at must be after starts at.')
    expect(saveSpy).not.toHaveBeenCalled()
    expect(syncSpy).not.toHaveBeenCalled()
  })
})

describe('updateDiscountHighDemand', () => {
  it('sets the flag and re-syncs the product metafields of a live discount', async () => {
    const { saveSpy, syncSpy } = setup(buildDiscount({ status: 'live' }))
    await updateDiscountHighDemand('disc_1', flashForm({ highDemand: 'on' }))
    expect(saveSpy.mock.calls[0][0].discounts[0].highDemand).toBe(true)
    expect(syncSpy).toHaveBeenCalledTimes(1)
  })

  it('removes the flag when the box is unchecked, and syncs nothing for a draft', async () => {
    const { saveSpy, syncSpy } = setup(buildDiscount({ highDemand: true }))
    await updateDiscountHighDemand('disc_1', flashForm({}))
    expect(saveSpy.mock.calls[0][0].discounts[0]).not.toHaveProperty('highDemand')
    expect(syncSpy).not.toHaveBeenCalled()
  })
})

describe('deleteDiscount and updateDiscountTitle with a Shopify discount', () => {
  it('deletes the Shopify discount before it removes the discount', async () => {
    const { saveSpy } = setup(buildDiscount({ status: 'live', flash: { ...FUTURE, showTeaser: true, shopifyDiscountId: RECORD_ID } }))
    vi.mocked(syncDiscountRecord).mockResolvedValue(undefined)
    await deleteDiscount('disc_1')
    expect(syncDiscountRecord).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft', flash: undefined, shopifyDiscountId: RECORD_ID }))
    expect(saveSpy).toHaveBeenCalledWith({ discounts: [] })
  })

  it('leaves the discount in place and shows the message when the Shopify discount cannot be deleted', async () => {
    const { saveSpy } = setup(buildDiscount({ status: 'live', flash: { ...FUTURE, showTeaser: true, shopifyDiscountId: RECORD_ID } }))
    vi.mocked(syncDiscountRecord).mockRejectedValue(new Error('Shopify is unavailable'))
    await expect(deleteDiscount('disc_1')).rejects.toThrow('Shopify is unavailable')
    expect(saveSpy).not.toHaveBeenCalled()
  })

  it('makes no Shopify discount call when a discount without flash is deleted', async () => {
    setup(buildDiscount())
    await deleteDiscount('disc_1')
    expect(syncDiscountRecord).not.toHaveBeenCalled()
  })

  it('renames the Shopify discount when the title of a live flash discount changes', async () => {
    setup(buildDiscount({ status: 'live', flash: { ...FUTURE, showTeaser: true, shopifyDiscountId: RECORD_ID } }))
    await updateDiscountTitle('disc_1', flashForm({ title: 'Black Friday' }))
    expect(syncDiscountRecord).toHaveBeenCalledWith(expect.objectContaining({ title: 'Black Friday', status: 'live', shopifyDiscountId: RECORD_ID }))
  })

  it('makes no Shopify discount call when the title of a discount without flash changes', async () => {
    setup(buildDiscount({ status: 'live' }))
    await updateDiscountTitle('disc_1', flashForm({ title: 'New' }))
    expect(syncDiscountRecord).not.toHaveBeenCalled()
  })
})
