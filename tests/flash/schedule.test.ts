import { describe, it, expect } from 'vitest'
import {
  FLASH_END_PASSED_MESSAGE,
  SCHEDULE_CHECKS,
  describeMissingTime,
  describeScheduleProblem,
  formatShopLocalNow,
} from '@/flash/schedule'

const problem = (options: { startsAt: string; endsAt: string; nowLocal?: string }) => describeScheduleProblem({ ...options, checks: SCHEDULE_CHECKS })

describe('describeScheduleProblem', () => {
  it('accepts a valid window, and empty or half-filled fields while the person is still typing', () => {
    expect(problem({ startsAt: '2026-07-01T12:00', endsAt: '2026-07-02T12:00' })).toBeNull()
    expect(problem({ startsAt: '', endsAt: '' })).toBeNull()
    expect(problem({ startsAt: '2026-07-01T12:00', endsAt: '' })).toBeNull()
    expect(problem({ startsAt: '', endsAt: '2026-07-02T12:00' })).toBeNull()
  })

  it('refuses an end that is not after the start', () => {
    expect(problem({ startsAt: '2026-07-02T12:00', endsAt: '2026-07-01T12:00' })).toBe('End must be after start.')
    expect(problem({ startsAt: '2026-07-01T12:00', endsAt: '2026-07-01T12:00' })).toBe('End must be after start.')
  })

  it.each([
    ['0202-07-01T12:00', '2026-07-02T12:00'],
    ['2026-07-01T12:00', '3026-07-02T12:00'],
    ['1999-12-31T23:59', '2026-07-02T12:00'],
    ['abcd-07-01T12:00', '2026-07-02T12:00'],
  ])('refuses a year outside 2000 to 2100: %s to %s', (startsAt, endsAt) => {
    expect(problem({ startsAt, endsAt })).toBe('Enter a year between 2000 and 2100.')
  })

  it('accepts the first and last allowed years', () => {
    expect(problem({ startsAt: '2000-01-01T00:00', endsAt: '2100-12-31T00:00' })).toBeNull()
  })

  it('refuses an end time that has already passed when the current shop time is given', () => {
    const nowLocal = '2026-07-01T12:00'
    expect(problem({ startsAt: '2026-06-01T00:00', endsAt: '2026-06-30T00:00', nowLocal })).toBe(FLASH_END_PASSED_MESSAGE)
    expect(problem({ startsAt: '2026-06-01T00:00', endsAt: '2026-07-01T12:00', nowLocal })).toBe(FLASH_END_PASSED_MESSAGE)
  })

  it('allows a start in the past while the end is in the future (a sale may start right now)', () => {
    expect(problem({ startsAt: '2026-06-01T00:00', endsAt: '2026-07-01T12:01', nowLocal: '2026-07-01T12:00' })).toBeNull()
  })

  it('does not check the end against the clock when no current time is given (an ended sale may be edited)', () => {
    expect(problem({ startsAt: '2020-06-01T00:00', endsAt: '2020-06-30T00:00' })).toBeNull()
  })

  it('reports the order problem before the clock problem', () => {
    expect(problem({ startsAt: '2026-07-02T00:00', endsAt: '2026-06-01T00:00', nowLocal: '2026-07-01T12:00' })).toBe('End must be after start.')
  })
})

describe('describeMissingTime', () => {
  it('asks for both times when either is empty, and only then', () => {
    expect(describeMissingTime({ startsAt: '', endsAt: '' })).toBe('Choose a start and an end time.')
    expect(describeMissingTime({ startsAt: '2026-07-01T12:00', endsAt: '' })).toBe('Choose a start and an end time.')
    expect(describeMissingTime({ startsAt: '', endsAt: '2026-07-01T12:00' })).toBe('Choose a start and an end time.')
    expect(describeMissingTime({ startsAt: '2026-07-01T12:00', endsAt: '2026-07-02T12:00' })).toBeNull()
  })
})

describe('formatShopLocalNow', () => {
  it('writes the shop wall-clock time as YYYY-MM-DDTHH:mm', () => {
    const now = new Date('2026-07-01T11:30:00Z')
    expect(formatShopLocalNow({ timeZone: 'Europe/London', now })).toBe('2026-07-01T12:30')
    expect(formatShopLocalNow({ timeZone: 'America/New_York', now })).toBe('2026-07-01T07:30')
  })

  it('uses a 24-hour clock at midnight', () => {
    expect(formatShopLocalNow({ timeZone: 'UTC', now: new Date('2026-01-02T00:05:00Z') })).toBe('2026-01-02T00:05')
  })
})
