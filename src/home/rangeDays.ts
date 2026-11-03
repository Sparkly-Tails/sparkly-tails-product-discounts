import { mapEach } from '@/metrics/mapEach'

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

export interface RangePreset {
  key: string
  label: string
  fromDay: string
  toDay: string
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_ABBREVIATIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The first day of the month `day` is in. */
export function pickMonthStart({ day }: { day: string }): string {
  return `${day.slice(0, 7)}-01`
}

const WEEK_TOOLS = { addDays }

/** The Monday of the week `day` is in (weeks run Monday to Sunday). */
export function pickWeekStart({ day, tools = WEEK_TOOLS }: { day: string; tools?: { addDays: typeof addDays } }): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
  return tools.addDays({ day, count: -((weekday + 6) % 7) })
}

/** How many days the range has, both ends counted. */
export function measureDays({ fromDay, toDay }: { fromDay: string; toDay: string }): number {
  return Math.round((new Date(`${toDay}T00:00:00Z`).getTime() - new Date(`${fromDay}T00:00:00Z`).getTime()) / MS_PER_DAY) + 1
}

export const RANGE_DAY_TOOLS = { addDays, pickMonthStart, pickWeekStart, measureDays }

/** The ready-made ranges of the date button, in the order of its list; `today` is the shop's day. */
export function listRangePresets({ today, tools = RANGE_DAY_TOOLS }: { today: string; tools?: typeof RANGE_DAY_TOOLS }): RangePreset[] {
  const weekStart = tools.pickWeekStart({ day: today })
  const monthStart = tools.pickMonthStart({ day: today })
  const yesterday = tools.addDays({ day: today, count: -1 })
  const lastMonthEnd = tools.addDays({ day: monthStart, count: -1 })
  return [
    { key: 'today', label: 'Today', fromDay: today, toDay: today },
    { key: 'yesterday', label: 'Yesterday', fromDay: yesterday, toDay: yesterday },
    { key: 'last7', label: 'Last 7 days', fromDay: tools.addDays({ day: today, count: -6 }), toDay: today },
    { key: 'lastWeek', label: 'Last week', fromDay: tools.addDays({ day: weekStart, count: -7 }), toDay: tools.addDays({ day: weekStart, count: -1 }) },
    { key: 'last30', label: 'Last 30 days', fromDay: tools.addDays({ day: today, count: -29 }), toDay: today },
    { key: 'last90', label: 'Last 90 days', fromDay: tools.addDays({ day: today, count: -89 }), toDay: today },
    { key: 'thisMonth', label: 'This month', fromDay: monthStart, toDay: today },
    { key: 'lastMonth', label: 'Last month', fromDay: tools.pickMonthStart({ day: lastMonthEnd }), toDay: lastMonthEnd },
  ]
}

export function pickDaysInMonth({ monthStart }: { monthStart: string }): number {
  return new Date(Number(monthStart.slice(0, 4)), Number(monthStart.slice(5, 7)), 0).getDate()
}

export function buildGridCell({ item: offset, context }: { item: number; context: { monthStart: string; leading: number; total: number } }): string | null {
  const dayNumber = offset - context.leading + 1
  return dayNumber >= 1 && dayNumber <= context.total ? `${context.monthStart.slice(0, 8)}${String(dayNumber).padStart(2, '0')}` : null
}

function pickIndex(_unused: unknown, index: number): number {
  return index
}

const GRID_TOOLS = { pickDaysInMonth, buildGridCell, mapEach }

/** The cells of a month calendar, weeks from Monday: a day text for each day of the month, null for the empty cells around them. */
export function buildMonthGrid({ monthStart, tools = GRID_TOOLS }: { monthStart: string; tools?: typeof GRID_TOOLS }): (string | null)[] {
  const leading = (new Date(`${monthStart}T00:00:00Z`).getUTCDay() + 6) % 7
  const total = tools.pickDaysInMonth({ monthStart })
  const offsets = Array.from({ length: Math.ceil((leading + total) / 7) * 7 }, pickIndex)
  return tools.mapEach({ items: offsets, run: tools.buildGridCell, context: { monthStart, leading, total } })
}

/** "November 2026". */
export function formatMonthTitle({ monthStart }: { monthStart: string }): string {
  return `${MONTH_NAMES[Number(monthStart.slice(5, 7)) - 1]} ${monthStart.slice(0, 4)}`
}

export function formatDayLabel({ day }: { day: string }): string {
  return `${Number(day.slice(8, 10))} ${MONTH_ABBREVIATIONS[Number(day.slice(5, 7)) - 1]}`
}

const LABEL_TOOLS = { formatDayLabel }

/** "12 Oct – 2 Nov", or "2 Nov" for one day. */
export function formatRangeLabel({ fromDay, toDay, tools = LABEL_TOOLS }: { fromDay: string; toDay: string; tools?: typeof LABEL_TOOLS }): string {
  return fromDay === toDay ? tools.formatDayLabel({ day: fromDay }) : `${tools.formatDayLabel({ day: fromDay })} – ${tools.formatDayLabel({ day: toDay })}`
}
