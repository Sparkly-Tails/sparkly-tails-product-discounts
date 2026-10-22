import { describe, it, expect, vi } from 'vitest'
import { loadDiscountRows } from '@/home/loadDiscountRows'
import { ROW_TOOLS } from '@/home/rowTools'

const tier = (overrides: Record<string, unknown> = {}) => ({
  discountId: 't1', name: 'Salmon Oil', title: 'Buy more', status: 'live' as const, pricingMode: 'percent' as const,
  tiers: [{ minQty: 3, percentOff: 10 }, { minQty: 5, percentOff: 20 }], ...overrides,
})
const time = (overrides: Record<string, unknown> = {}) => ({ discountId: 'm1', title: 'Spring Sale', startsAt: '2026-03-01T09:00', endsAt: '2026-03-31T23:59', ...overrides })

function load({ tiers = [tier()], times = [time()], label = 'Active' as 'Upcoming' | 'Active' | 'Expired', flashStatus = 'Active' as 'Upcoming' | 'Active' | 'Ended' } = {}) {
  const getStatusLabel = vi.fn(() => label)
  const getFlashStatus = vi.fn(() => flashStatus)
  const loadTimezone = vi.fn(async () => 'Europe/London')
  const rowsPromise = loadDiscountRows({
    loadTierDiscounts: async () => tiers,
    loadTimeDiscounts: async () => times,
    loadTimezone,
    loadCurrencyCode: async () => 'GBP',
    getStatusLabel,
    getFlashStatus,
    tools: ROW_TOOLS,
  })
  return { rowsPromise, getStatusLabel, getFlashStatus, loadTimezone }
}

describe('loadDiscountRows', () => {
  it('turns a live percent discount into an active row with its rules text and edit link', async () => {
    const [row] = await load({ times: [] }).rowsPromise
    expect(row).toEqual({
      key: 'tier:t1', kind: 'tier', title: 'Salmon Oil', subtitle: 'Buy more', rules: '3+ units (10% off), 5+ units (20% off)', isActive: true, href: '/discounts/t1',
    })
  })

  it('writes a fixed price in the currency of the shop and turns a draft into an inactive row', async () => {
    const draft = tier({ status: 'draft', pricingMode: 'fixed', tiers: [{ minQty: 3, fixedPrice: 1.5 }] })
    const [row] = await load({ tiers: [draft], times: [] }).rowsPromise
    expect([row.rules, row.isActive]).toEqual(['3+ units (£1.50 each)', false])
  })

  it('turns a time-based discount into a row with its schedule, using the status of the shop timezone', async () => {
    const { rowsPromise, getStatusLabel } = load({ tiers: [], label: 'Upcoming' })
    const [row] = await rowsPromise
    expect(getStatusLabel).toHaveBeenCalledWith({ startsAt: '2026-03-01T09:00', endsAt: '2026-03-31T23:59', timezone: 'Europe/London' })
    expect(row).toEqual({
      key: 'time:m1', kind: 'time', title: 'Spring Sale', subtitle: '', rules: 'Mar 1, 2026 - Mar 31, 2026 (Scheduled)', isActive: false, href: '/time-discounts/m1',
    })
  })

  it('lists the tier rows before the time-based rows, each in stored order', async () => {
    const rows = await load({ tiers: [tier({ discountId: 'a' }), tier({ discountId: 'b' })], times: [time({ discountId: 'c' })] }).rowsPromise
    expect(rows.map((row) => row.key)).toEqual(['tier:a', 'tier:b', 'time:c'])
  })

  it('gives no rows for a shop without discounts', async () => {
    expect(await load({ tiers: [], times: [] }).rowsPromise).toEqual([])
  })

  it('does not fail on blank names and titles', async () => {
    const rows = await load({ tiers: [tier({ name: ' ', title: '' })], times: [time({ title: '' })] }).rowsPromise
    expect(rows.map((row) => row.title)).toEqual(['Untitled discount', 'Untitled discount'])
  })

  it('passes a loader failure on instead of hiding it', async () => {
    const failing = loadDiscountRows({
      loadTierDiscounts: async () => { throw new Error('Shopify is down') },
      loadTimeDiscounts: async () => [],
      loadTimezone: async () => 'UTC',
      loadCurrencyCode: async () => 'GBP',
      getStatusLabel: () => 'Active',
      getFlashStatus: () => 'Active',
      tools: ROW_TOOLS,
    })
    await expect(failing).rejects.toThrow('Shopify is down')
  })
})

describe('loadDiscountRows with flash sales', () => {
  const flash = { startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59' }
  const flashTier = (overrides: Record<string, unknown> = {}) => tier({ flash, tiers: [{ minQty: 3, percentOff: 10 }], ...overrides })

  it('shows the window and the state after the tier rules, and asks for the state with the shop timezone', async () => {
    const { rowsPromise, getFlashStatus } = load({ tiers: [flashTier()], times: [], flashStatus: 'Upcoming' })
    const [row] = await rowsPromise
    expect(row.rules).toBe('3+ units (10% off) · Flash sale: Nov 27, 2026 - Nov 30, 2026 (Upcoming)')
    expect(getFlashStatus).toHaveBeenCalledWith({ startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', timezone: 'Europe/London' })
  })

  it('counts a live sale as active only while it is Active; Upcoming and Ended rows are inactive', async () => {
    const states = [] as boolean[]
    for (const flashStatus of ['Upcoming', 'Active', 'Ended'] as const) {
      const [row] = await load({ tiers: [flashTier()], times: [], flashStatus }).rowsPromise
      states.push(row.isActive)
    }
    expect(states).toEqual([false, true, false])
  })

  it('keeps an Ended sale in the list with the word Ended', async () => {
    const [row] = await load({ tiers: [flashTier()], times: [], flashStatus: 'Ended' }).rowsPromise
    expect(row.rules).toContain('(Ended)')
  })

  it('makes a draft sale inactive even inside its window', async () => {
    const [row] = await load({ tiers: [flashTier({ status: 'draft' })], times: [], flashStatus: 'Active' }).rowsPromise
    expect(row.isActive).toBe(false)
  })

  it('leaves a discount without a flash sale exactly as before and never asks for a flash state', async () => {
    const { rowsPromise, getFlashStatus } = load({ times: [] })
    const [row] = await rowsPromise
    expect([row.rules, row.isActive]).toEqual(['3+ units (10% off), 5+ units (20% off)', true])
    expect(getFlashStatus).not.toHaveBeenCalled()
  })
})
