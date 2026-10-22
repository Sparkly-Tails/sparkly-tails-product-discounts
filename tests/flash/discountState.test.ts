import { describe, it, expect } from 'vitest'
import { computeLocalFlashStatus, describeFlashState, DISCOUNT_STATE_TOOLS } from '@/flash/discountState'
import { zonedTimeToUtc } from '@/lib/shop'

const WINDOW = { startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', timeZone: 'Europe/London', convertToUtc: zonedTimeToUtc, tools: DISCOUNT_STATE_TOOLS }
const at = (iso: string) => Date.parse(iso)

describe('computeLocalFlashStatus', () => {
  it('is Upcoming before the shop-local start, Active inside the window and Ended from the end minute', () => {
    expect(computeLocalFlashStatus({ ...WINDOW, nowMs: at('2026-11-27T08:59:59Z') })).toBe('Upcoming')
    expect(computeLocalFlashStatus({ ...WINDOW, nowMs: at('2026-11-27T09:00:00Z') })).toBe('Active')
    expect(computeLocalFlashStatus({ ...WINDOW, nowMs: at('2026-11-30T23:58:59Z') })).toBe('Active')
    expect(computeLocalFlashStatus({ ...WINDOW, nowMs: at('2026-11-30T23:59:00Z') })).toBe('Ended')
  })

  it('reads the times in the shop timezone, not as UTC (New York is five hours behind London in November)', () => {
    const newYork = { ...WINDOW, timeZone: 'America/New_York' }
    expect(computeLocalFlashStatus({ ...newYork, nowMs: at('2026-11-27T09:00:00Z') })).toBe('Upcoming')
    expect(computeLocalFlashStatus({ ...newYork, nowMs: at('2026-11-27T14:00:00Z') })).toBe('Active')
  })
})

describe('describeFlashState', () => {
  it('names the state of a live sale', () => {
    expect(describeFlashState({ discountStatus: 'live', flashStatus: 'Upcoming' })).toBe('Flash sale: Upcoming')
    expect(describeFlashState({ discountStatus: 'live', flashStatus: 'Active' })).toBe('Flash sale: Active')
    expect(describeFlashState({ discountStatus: 'live', flashStatus: 'Ended' })).toBe('Flash sale: Ended')
  })

  it('says a draft sale is not running, whatever its dates say', () => {
    expect(describeFlashState({ discountStatus: 'draft', flashStatus: 'Active' })).toBe('Flash sale: not running (draft)')
  })

  it('says nothing for a discount without a flash sale', () => {
    expect(describeFlashState({ discountStatus: 'live', flashStatus: null })).toBe('')
  })
})
