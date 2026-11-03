// The date range of the homepage cards, kept in the page address: `?range=<preset key>` or `?from=YYYY-MM-DD&to=YYYY-MM-DD`.
// Every step is a small function, handed to the others through PARSE_TOOLS.
import { pickLastValue } from '@/home/tableQuery'
import { formatRangeLabel, listRangePresets, measureDays, type RangePreset } from '@/home/rangeDays'

export interface MetricsRange {
  fromDay: string
  toDay: string
  label: string
}

interface Days {
  fromDay: string
  toDay: string
}

type RawQuery = Record<string, string | string[] | undefined>

const DEFAULT_KEY = 'last30'
const MAX_DAYS = 366
const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/

interface RangeTools {
  matchDayShape: (args: { text: string }) => boolean
  isRealDay: (args: { text: string }) => boolean
  isDay: (args: { text: string; tools: RangeTools }) => boolean
  sortDays: (args: { from: string; to: string }) => Days
  readCustomDays: (args: { from: string; to: string; tools: RangeTools }) => Days | null
  isRangeAllowed: (args: { days: Days; today: string; tools: RangeTools }) => boolean
  pickCustomRange: (args: { from: string; to: string; today: string; tools: RangeTools }) => MetricsRange | null
  findPresetRange: (args: { presets: RangePreset[]; key: string }) => MetricsRange | null
  pickFirstRange: (args: { candidates: (MetricsRange | null)[] }) => MetricsRange
  pickPresetKey: (args: { presets: RangePreset[]; key: string }) => string | null
  formatPresetParams: (args: { key: string }) => string
  formatCustomParams: (args: { custom: MetricsRange | null }) => string
  formatParams: (args: { presetKey: string | null; custom: MetricsRange | null; tools: RangeTools }) => string
  pickLastValue: typeof pickLastValue
  listRangePresets: typeof listRangePresets
  measureDays: typeof measureDays
  formatRangeLabel: typeof formatRangeLabel
}

export function matchDayShape({ text }: { text: string }): boolean {
  return DAY_SHAPE.test(text)
}

/** True for a day that exists, such as 2026-02-28 but not 2026-02-30 or 2026-13-40. */
export function isRealDay({ text }: { text: string }): boolean {
  const date = new Date(`${text}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text
}

export function isDay({ text, tools }: { text: string; tools: RangeTools }): boolean {
  return tools.matchDayShape({ text }) && tools.isRealDay({ text })
}

export function sortDays({ from, to }: { from: string; to: string }): Days {
  return from <= to ? { fromDay: from, toDay: to } : { fromDay: to, toDay: from }
}

/** The two days in order, or null when either is not a day. */
export function readCustomDays({ from, to, tools }: { from: string; to: string; tools: RangeTools }): Days | null {
  if (!(tools.isDay({ text: from, tools }) && tools.isDay({ text: to, tools }))) return null
  return tools.sortDays({ from, to })
}

/** Not in the future, and not longer than 366 days. */
export function isRangeAllowed({ days, today, tools }: { days: Days; today: string; tools: RangeTools }): boolean {
  return days.toDay <= today && tools.measureDays(days) <= MAX_DAYS
}

export function pickCustomRange({ from, to, today, tools }: { from: string; to: string; today: string; tools: RangeTools }): MetricsRange | null {
  const days = tools.readCustomDays({ from, to, tools })
  return days && tools.isRangeAllowed({ days, today, tools }) ? { ...days, label: tools.formatRangeLabel(days) } : null
}

function pickKeyEntry(preset: RangePreset): [string, RangePreset] {
  return [preset.key, preset]
}

export function findPresetRange({ presets, key }: { presets: RangePreset[]; key: string }): MetricsRange | null {
  const preset = new Map(presets.map(pickKeyEntry)).get(key)
  return preset ? { fromDay: preset.fromDay, toDay: preset.toDay, label: preset.label } : null
}

export function pickPresetKey({ presets, key }: { presets: RangePreset[]; key: string }): string | null {
  return new Map(presets.map(pickKeyEntry)).has(key) ? key : null
}

function isRange(value: MetricsRange | null): value is MetricsRange {
  return value !== null
}

export function pickFirstRange({ candidates }: { candidates: (MetricsRange | null)[] }): MetricsRange {
  return candidates.find(isRange) as MetricsRange
}

export function formatPresetParams({ key }: { key: string }): string {
  return key === DEFAULT_KEY ? '' : `range=${key}`
}

export function formatCustomParams({ custom }: { custom: MetricsRange | null }): string {
  return custom ? `from=${custom.fromDay}&to=${custom.toDay}` : ''
}

export function formatParams({ presetKey, custom, tools }: { presetKey: string | null; custom: MetricsRange | null; tools: RangeTools }): string {
  return presetKey ? tools.formatPresetParams({ key: presetKey }) : tools.formatCustomParams({ custom })
}

export const PARSE_TOOLS: RangeTools = {
  matchDayShape, isRealDay, isDay, sortDays, readCustomDays, isRangeAllowed, pickCustomRange, findPresetRange, pickFirstRange,
  pickPresetKey, formatPresetParams, formatCustomParams, formatParams, pickLastValue, listRangePresets, measureDays, formatRangeLabel,
}

/** The range the address asks for; anything unusable gives the last 30 days. */
export function parseMetricsQuery({ raw, today, tools = PARSE_TOOLS }: { raw: RawQuery; today: string; tools?: RangeTools }): MetricsRange {
  const presets = tools.listRangePresets({ today })
  const preset = tools.findPresetRange({ presets, key: tools.pickLastValue({ value: raw.range }) })
  const custom = tools.pickCustomRange({ from: tools.pickLastValue({ value: raw.from }), to: tools.pickLastValue({ value: raw.to }), today, tools })
  return tools.pickFirstRange({ candidates: [preset, custom, tools.findPresetRange({ presets, key: DEFAULT_KEY })] })
}

/** The address parameters that give the same range back (empty for the default), so other links of the page can carry them. */
export function buildMetricsParams({ raw, today, tools = PARSE_TOOLS }: { raw: RawQuery; today: string; tools?: RangeTools }): string {
  const presetKey = tools.pickPresetKey({ presets: tools.listRangePresets({ today }), key: tools.pickLastValue({ value: raw.range }) })
  const custom = tools.pickCustomRange({ from: tools.pickLastValue({ value: raw.from }), to: tools.pickLastValue({ value: raw.to }), today, tools })
  return tools.formatParams({ presetKey, custom, tools })
}
