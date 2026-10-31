import { describe, it, expect, vi } from 'vitest'
import * as steps from '@/form/saveSteps'
import * as flow from '@/form/saveFlow'
import { findDiscountOrThrow, needsRecordSync } from '@/actions/discountSteps'
import type { Config, Discount } from '@/lib/config'
import { DEFAULT_WIDGET_STYLE } from '@/lib/widgetStyle'
import type { ParsedDiscount } from '@/form/parseDiscountForm'
import type { SaveTools } from '@/form/saveFlow'

const FLASH = { startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', showTeaser: true }
const VALUES: ParsedDiscount = {
  name: 'Black Friday', members: [{ productId: 'p1' }], pricingMode: 'percent', tiers: [{ minQty: 3, percentOff: 10 }], flash: null, highDemand: false, style: DEFAULT_WIDGET_STYLE, goLive: false, takeOffline: false,
}
const OTHER: Discount = { discountId: 'disc_other', name: 'Other', title: 'Other', status: 'draft', pricingMode: 'percent', members: [{ productId: 'p9' }], tiers: [{ minQty: 2, percentOff: 5 }] }
const EXISTING: Discount = {
  discountId: 'disc_1', name: 'Old name', title: 'Old customer title', status: 'live', pricingMode: 'percent',
  members: [{ productId: 'p1' }, { productId: 'p2' }], tiers: [{ minQty: 2, percentOff: 5 }],
  flash: { ...FLASH, shopifyDiscountId: 'gid://shopify/DiscountAutomaticNode/9' },
}

// The real steps, with the shop (Shopify, the config, the clock) replaced by fakes that note what was called.
function buildTools(config: Config, overrides: Partial<Record<keyof SaveTools, unknown>> = {}) {
  const calls: string[] = []
  const saved: Config[] = []
  const note = (name: string) => { calls.push(name) }
  const tools = {
    ...steps,
    ...flow,
    findDiscountOrThrow,
    needsRecordSync,
    loadConfig: async () => structuredClone(config),
    saveConfig: async (next: Config) => { note('saveConfig'); saved.push(next) },
    readShopNow: async () => ({ timeZone: 'UTC', nowLocal: '2026-10-30T12:00' }),
    assertFlashWindow: vi.fn(() => note('assertFlashWindow')),
    assertFreeOfLiveDiscounts: vi.fn(async () => note('assertFreeOfLiveDiscounts')),
    assertFreeOfOpenTimeDiscounts: vi.fn(async () => note('assertFreeOfOpenTimeDiscounts')),
    assertPricingAllowed: vi.fn(async () => note('assertPricingAllowed')),
    ensureTierDiscount: vi.fn(async () => note('ensureTierDiscount')),
    syncRecordOf: vi.fn(async (discount: Discount) => { note('syncRecordOf'); if (discount.flash) discount.flash.shopifyDiscountId = 'gid://shopify/DiscountAutomaticNode/NEW' }),
    syncDiscountMetafields: vi.fn(async () => note('syncDiscountMetafields')),
    clearDiscountMetafields: vi.fn(async () => note('clearDiscountMetafields')),
    newDiscountId: () => 'disc_new',
    ...overrides,
  } as unknown as SaveTools
  return { tools, calls, saved }
}

describe('saveDiscountFlow: a new discount', () => {
  it('is saved as a draft titled with its name, with no Shopify discount and nothing on the storefront', async () => {
    const { tools, calls, saved } = buildTools({ discounts: [OTHER] })
    const result = await flow.saveDiscountFlow({ discountId: undefined, values: VALUES, tools })
    expect(result).toEqual({ ok: true, discountId: 'disc_new' })
    expect(saved[0].discounts).toEqual([OTHER, expect.objectContaining({ discountId: 'disc_new', name: 'Black Friday', title: 'Black Friday', status: 'draft' })])
    expect(calls).not.toContain('syncRecordOf')
    expect(calls).not.toContain('syncDiscountMetafields')
  })

  it('makes sure the checkout discount exists before saving', async () => {
    const { tools, calls } = buildTools({ discounts: [] })
    await flow.saveDiscountFlow({ discountId: undefined, values: VALUES, tools })
    expect(calls.indexOf('ensureTierDiscount')).toBeLessThan(calls.indexOf('saveConfig'))
  })

  it('goes live and puts its prices on the storefront with Go live', async () => {
    const { tools, calls, saved } = buildTools({ discounts: [] })
    await flow.saveDiscountFlow({ discountId: undefined, values: { ...VALUES, goLive: true }, tools })
    expect(saved[0].discounts[0].status).toBe('live')
    expect(calls).toContain('syncDiscountMetafields')
  })

  it('checks the window, the live discounts, the time-based discounts and Shopify, and only then saves, when it goes live as a flash sale', async () => {
    const { tools, calls, saved } = buildTools({ discounts: [] })
    await flow.saveDiscountFlow({ discountId: undefined, values: { ...VALUES, goLive: true, flash: FLASH }, tools })
    expect(calls).toEqual(['assertFlashWindow', 'assertFreeOfLiveDiscounts', 'assertPricingAllowed', 'assertFreeOfOpenTimeDiscounts', 'ensureTierDiscount', 'syncRecordOf', 'saveConfig', 'syncDiscountMetafields'])
    expect(saved[0].discounts[0].flash?.shopifyDiscountId).toBe('gid://shopify/DiscountAutomaticNode/NEW')
  })
})

describe('saveDiscountFlow: an existing discount', () => {
  it('keeps its place, its id, its title and its status, and changes what the form holds', async () => {
    const { tools, saved } = buildTools({ discounts: [OTHER, EXISTING] })
    const result = await flow.saveDiscountFlow({ discountId: 'disc_1', values: { ...VALUES, flash: null }, tools })
    expect(result).toEqual({ ok: true, discountId: 'disc_1' })
    expect(saved[0].discounts[0]).toEqual(OTHER)
    expect(saved[0].discounts[1]).toMatchObject({ discountId: 'disc_1', name: 'Black Friday', title: 'Old customer title', status: 'live', members: [{ productId: 'p1' }] })
  })

  it('updates the Shopify discount, then the config, then the storefront, and clears the products that were removed', async () => {
    const { tools, calls } = buildTools({ discounts: [EXISTING] })
    await flow.saveDiscountFlow({ discountId: 'disc_1', values: { ...VALUES, flash: { ...FLASH, endsAt: '2026-12-05T23:59' } }, tools })
    expect(calls).toEqual(['assertFlashWindow', 'assertFreeOfLiveDiscounts', 'assertPricingAllowed', 'assertFreeOfOpenTimeDiscounts', 'syncRecordOf', 'saveConfig', 'clearDiscountMetafields', 'syncDiscountMetafields'])
    expect((tools.clearDiscountMetafields as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual([{ productId: 'p2' }])
  })

  it('deletes the Shopify discount when the flash sale is switched off', async () => {
    const { tools, saved } = buildTools({ discounts: [EXISTING] })
    await flow.saveDiscountFlow({ discountId: 'disc_1', values: VALUES, tools })
    expect(tools.syncRecordOf).toHaveBeenCalledTimes(1)
    expect((tools.syncRecordOf as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe('gid://shopify/DiscountAutomaticNode/9')
    expect(saved[0].discounts[0].flash).toBeUndefined()
  })

  it('does not check a window that was saved and is left alone, so a sale that has ended does not stop other edits', async () => {
    const { tools } = buildTools({ discounts: [EXISTING] })
    await flow.saveDiscountFlow({ discountId: 'disc_1', values: { ...VALUES, flash: FLASH }, tools })
    expect(tools.assertFlashWindow).not.toHaveBeenCalled()
  })

  it('takes a live discount offline: saved as a draft, its Shopify discount deleted and all its products cleared from the storefront', async () => {
    const { tools, calls, saved } = buildTools({ discounts: [EXISTING] })
    await flow.saveDiscountFlow({ discountId: 'disc_1', values: { ...VALUES, members: EXISTING.members, takeOffline: true }, tools })
    expect(saved[0].discounts[0].status).toBe('draft')
    expect(calls).toEqual(['assertPricingAllowed', 'syncRecordOf', 'saveConfig', 'clearDiscountMetafields'])
    expect((tools.clearDiscountMetafields as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual([{ productId: 'p1' }, { productId: 'p2' }])
  })

  it('does not touch the storefront for a draft', async () => {
    const { tools, calls } = buildTools({ discounts: [{ ...EXISTING, status: 'draft', flash: undefined }] })
    await flow.saveDiscountFlow({ discountId: 'disc_1', values: VALUES, tools })
    expect(calls).not.toContain('syncDiscountMetafields')
    expect(calls).toContain('saveConfig')
  })

  it('says so when the discount is not there any more', async () => {
    const { tools, saved } = buildTools({ discounts: [OTHER] })
    const result = await flow.saveDiscountFlow({ discountId: 'disc_gone', values: VALUES, tools })
    expect(result).toEqual({ ok: false, error: 'Discount disc_gone not found' })
    expect(saved).toEqual([])
  })
})

describe('saveDiscountFlow: a save that cannot go through changes nothing', () => {
  it('stops when Shopify refuses the flash sale discount (for example the limit of 25)', async () => {
    const { tools, calls, saved } = buildTools({ discounts: [EXISTING] }, { syncRecordOf: vi.fn(async () => { throw new Error('Shopify allows only 25 active discounts.') }) })
    const result = await flow.saveDiscountFlow({ discountId: 'disc_1', values: { ...VALUES, flash: { ...FLASH, endsAt: '2026-12-05T23:59' } }, tools })
    expect(result).toEqual({ ok: false, error: 'Shopify allows only 25 active discounts.' })
    expect(saved).toEqual([])
    expect(calls).not.toContain('saveConfig')
    expect(calls).not.toContain('syncDiscountMetafields')
  })

  it('stops when a flash window is refused (for example an end that has passed)', async () => {
    const { tools, saved } = buildTools({ discounts: [] }, { assertFlashWindow: vi.fn(() => { throw new Error('The end time has already passed. Choose a later end time.') }) })
    const result = await flow.saveDiscountFlow({ discountId: undefined, values: { ...VALUES, flash: FLASH }, tools })
    expect(result).toEqual({ ok: false, error: 'The end time has already passed. Choose a later end time.' })
    expect(saved).toEqual([])
  })

  it('stops when a discount that goes live has a product that another live discount has', async () => {
    const { tools, saved } = buildTools({ discounts: [] }, { assertFreeOfLiveDiscounts: vi.fn(async () => { throw new Error('"Tuna Soup" is already in live discount "Spring".') }) })
    expect(await flow.saveDiscountFlow({ discountId: undefined, values: { ...VALUES, goLive: true }, tools })).toEqual({ ok: false, error: '"Tuna Soup" is already in live discount "Spring".' })
    expect(saved).toEqual([])
  })

  it('checks a live discount that is edited, but not one that is a draft', async () => {
    const live = buildTools({ discounts: [EXISTING] })
    await flow.saveDiscountFlow({ discountId: 'disc_1', values: { ...VALUES, flash: null }, tools: live.tools })
    expect(live.tools.assertFreeOfLiveDiscounts).toHaveBeenCalledWith(expect.objectContaining({ members: [{ productId: 'p1' }], discountId: 'disc_1' }))
    const draft = buildTools({ discounts: [] })
    await flow.saveDiscountFlow({ discountId: undefined, values: VALUES, tools: draft.tools })
    expect(draft.tools.assertFreeOfLiveDiscounts).not.toHaveBeenCalled()
    expect(draft.saved).toHaveLength(1)
  })

  it('does not ask the time-based discounts about a live discount that is not a flash sale', async () => {
    const { tools } = buildTools({ discounts: [] })
    await flow.saveDiscountFlow({ discountId: undefined, values: { ...VALUES, goLive: true }, tools })
    expect(tools.assertFreeOfOpenTimeDiscounts).not.toHaveBeenCalled()
  })

  it('stops when a fixed price needs products at one price', async () => {
    const { tools, saved } = buildTools({ discounts: [] }, { assertPricingAllowed: vi.fn(async () => { throw new Error('These products/variants have different prices') }) })
    const result = await flow.saveDiscountFlow({ discountId: undefined, values: { ...VALUES, pricingMode: 'fixed', tiers: [{ minQty: 2, fixedPrice: 1.5 }] }, tools })
    expect(result).toEqual({ ok: false, error: 'These products/variants have different prices' })
    expect(saved).toEqual([])
  })

  it('gives a plain sentence for a failure that has no message', async () => {
    const { tools } = buildTools({ discounts: [] }, { loadConfig: async () => { throw 'boom' } })
    expect(await flow.saveDiscountFlow({ discountId: undefined, values: VALUES, tools })).toEqual({ ok: false, error: 'The discount could not be saved. Try again.' })
  })
})
