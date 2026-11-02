// Days are `YYYY-MM-DD` text with no time zone inside; the shop's time zone only decides which day it is today.

const MS_PER_DAY = 24 * 3600 * 1000

/** The day `count` days after `day` (before it when `count` is negative). */
export function addDays({ day, count }: { day: string; count: number }): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + count * MS_PER_DAY).toISOString().slice(0, 10)
}

/** The calendar day it is at `nowIso` in the shop's time zone. */
export function pickShopDay({ nowIso, timeZone }: { nowIso: string; timeZone: string }): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowIso))
}
