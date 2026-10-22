// The start and end of a flash sale: checks on what the form holds. Times are
// the shop's wall-clock text from a datetime-local input (`2026-11-27T09:00`),
// which compares correctly as text. Copied from the time-based discount's
// schedule check (which will be removed), so nothing here imports from it.

/** Shown (and thrown) when a flash sale's end time is no longer in the future. */
export const FLASH_END_PASSED_MESSAGE = 'The end time has already passed. Choose a later end time.'

const YEAR_MESSAGE = 'Enter a year between 2000 and 2100.'
const ORDER_MESSAGE = 'End must be after start.'
const MISSING_MESSAGE = 'Choose a start and an end time.'

// A half-typed year (0202) is a problem because it can still form a valid-looking pair.
export function hasBadYear({ startsAt, endsAt }: { startsAt: string; endsAt: string }): boolean {
  return [startsAt, endsAt].some((value) => {
    const year = Number(value.slice(0, 4))
    return value !== '' && !(year >= 2000 && year <= 2100)
  })
}

export function isEndBeforeStart({ startsAt, endsAt }: { startsAt: string; endsAt: string }): boolean {
  return startsAt !== '' && endsAt !== '' && endsAt <= startsAt
}

export function hasEndPassed({ endsAt, nowLocal }: { endsAt: string; nowLocal: string | undefined }): boolean {
  return nowLocal !== undefined && endsAt !== '' && endsAt <= nowLocal
}

export const SCHEDULE_CHECKS = { hasBadYear, isEndBeforeStart, hasEndPassed }

/**
 * The message for a window that must not be saved, or null. An empty time is
 * not a problem yet (the person is still typing). Pass `nowLocal` (see
 * formatShopLocalNow) to also refuse an end that is not in the future, for a
 * sale that is being created or switched on; an existing sale may be edited
 * after it ended.
 */
export function describeScheduleProblem(options: {
  startsAt: string
  endsAt: string
  nowLocal?: string
  checks: typeof SCHEDULE_CHECKS
}): string | null {
  const { startsAt, endsAt, nowLocal, checks } = options
  const found = [
    [checks.hasBadYear({ startsAt, endsAt }), YEAR_MESSAGE],
    [checks.isEndBeforeStart({ startsAt, endsAt }), ORDER_MESSAGE],
    [checks.hasEndPassed({ endsAt, nowLocal }), FLASH_END_PASSED_MESSAGE],
  ].find(([failed]) => failed)
  return found ? String(found[1]) : null
}

// Both times are needed to save a flash sale.
export function describeMissingTime({ startsAt, endsAt }: { startsAt: string; endsAt: string }): string | null {
  return startsAt === '' || endsAt === '' ? MISSING_MESSAGE : null
}

/** The current time on the shop's wall clock in the same form a datetime-local input holds. */
export function formatShopLocalNow({ timeZone, now }: { timeZone: string; now: Date }): string {
  const values: Record<string, string> = {}
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  for (const part of formatter.formatToParts(now)) values[part.type] = part.value
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`
}
