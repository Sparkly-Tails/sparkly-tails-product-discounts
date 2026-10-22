import { describe, it, expect } from 'vitest'
import { computeFlashStatus } from '@/flash/status'

const window = { startsAtMs: 1_000_000, endsAtMs: 2_000_000 }

describe('computeFlashStatus', () => {
  it('is Upcoming before the start', () => {
    expect(computeFlashStatus({ ...window, nowMs: 999_999 })).toBe('Upcoming')
  })

  it('is Active from the start second on', () => {
    expect(computeFlashStatus({ ...window, nowMs: 1_000_000 })).toBe('Active')
    expect(computeFlashStatus({ ...window, nowMs: 1_500_000 })).toBe('Active')
    expect(computeFlashStatus({ ...window, nowMs: 1_999_999 })).toBe('Active')
  })

  it('is Ended from the end second on', () => {
    expect(computeFlashStatus({ ...window, nowMs: 2_000_000 })).toBe('Ended')
    expect(computeFlashStatus({ ...window, nowMs: 9_000_000 })).toBe('Ended')
  })
})
