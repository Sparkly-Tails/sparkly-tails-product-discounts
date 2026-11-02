import { describe, it, expect, vi } from 'vitest'
import { loadDiscountRows } from '@/home/loadDiscountRows'
import { ROW_TOOLS } from '@/home/rowTools'

const tier = (overrides: Record<string, unknown> = {}) => ({
  discountId: 't1', name: 'Salmon Oil', title: 'Buy more', status: 'live' as const, pricingMode: 'percent' as const,
  tiers: [{ minQty: 3, percentOff: 10 }, { minQty: 5, percentOff: 20 }], ...overrides,
})

function load({ tiers = [tier()], flashStatus = 'Active' as 'Upcoming' | 'Active' | 'Ended' } = {}) {
  const getFlashStatus = vi.fn(() => flashStatus)
  const loadTimezone = vi.fn(async () => 'Europe/London')
  const rowsPromise = loadDiscountRows({
    loadTierDiscounts: async () => tiers,
    loadTimezone,
    loadCurrencyCode: async () => 'GBP',
    getFlashStatus,
    tools: ROW_TOOLS,
  })
  return { rowsPromise, getFlashStatus, loadTimezone }
}

describe('loadDiscountRows', () => {
  it('turns a live percent discount into an active row with its rules text and edit link', async () => {
    const [row] = await load().rowsPromise
    expect(row).toEqual({
      key: 'tier:t1', title: 'Salmon Oil', subtitle: 'Buy more', rules: '3+ units (10% off), 5+ units (20% off)', isActive: true, href: '/discounts/t1',
    })
  })

  it('writes a fixed price in the currency of the shop and turns a draft into an inactive row', async () => {
    const draft = tier({ status: 'draft', pricingMode: 'fixed', tiers: [{ minQty: 3, fixedPrice: 1.5 }] })
    const [row] = await load({ tiers: [draft] }).rowsPromise
    expect([row.rules, row.isActive]).toEqual(['3+ units (£1.50 each)', false])
  })

  it('lists the rows in stored order', async () => {
    const rows = await load({ tiers: [tier({ discountId: 'a' }), tier({ discountId: 'b' })] }).rowsPromise
    expect(rows.map((row) => row.key)).toEqual(['tier:a', 'tier:b'])
  })

  it('gives no rows for a shop without discounts', async () => {
    expect(await load({ tiers: [] }).rowsPromise).toEqual([])
  })

  it('does not fail on a blank name and title', async () => {
    const rows = await load({ tiers: [tier({ name: ' ', title: '' })] }).rowsPromise
    expect(rows.map((row) => row.title)).toEqual(['Untitled discount'])
  })

  it('passes a loader failure on instead of hiding it', async () => {
    const failing = loadDiscountRows({
      loadTierDiscounts: async () => { throw new Error('Shopify is down') },
      loadTimezone: async () => 'UTC',
      loadCurrencyCode: async () => 'GBP',
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
    const { rowsPromise, getFlashStatus } = load({ tiers: [flashTier()], flashStatus: 'Upcoming' })
    const [row] = await rowsPromise
    expect(row.rules).toBe('3+ units (10% off) · Flash sale: Nov 27, 2026 - Nov 30, 2026 (Upcoming)')
    expect(getFlashStatus).toHaveBeenCalledWith({ startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', timezone: 'Europe/London' })
  })

  it('counts a live sale as active only while it is Active; Upcoming and Ended rows are inactive', async () => {
    const states = [] as boolean[]
    for (const flashStatus of ['Upcoming', 'Active', 'Ended'] as const) {
      const [row] = await load({ tiers: [flashTier()], flashStatus }).rowsPromise
      states.push(row.isActive)
    }
    expect(states).toEqual([false, true, false])
  })

  it('keeps an Ended sale in the list with the word Ended', async () => {
    const [row] = await load({ tiers: [flashTier()], flashStatus: 'Ended' }).rowsPromise
    expect(row.rules).toContain('(Ended)')
  })

  it('makes a draft sale inactive even inside its window', async () => {
    const [row] = await load({ tiers: [flashTier({ status: 'draft' })], flashStatus: 'Active' }).rowsPromise
    expect(row.isActive).toBe(false)
  })

  it('leaves a discount without a flash sale exactly as before and never asks for a flash state', async () => {
    const { rowsPromise, getFlashStatus } = load()
    const [row] = await rowsPromise
    expect([row.rules, row.isActive]).toEqual(['3+ units (10% off), 5+ units (20% off)', true])
    expect(getFlashStatus).not.toHaveBeenCalled()
  })
})
