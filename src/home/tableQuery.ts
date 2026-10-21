// The state of the homepage "All discounts" table (tab, type filter, search,
// sort, page) and what it shows. The state lives in the page address, and
// every step is a small pure function; the steps are handed to the functions
// that need them through TABLE_TOOLS.
import type { DiscountRow } from '@/home/discountRows'

export const TAB_VALUES = ['all', 'active', 'inactive'] as const
export const TYPE_VALUES = ['all', 'tier', 'time'] as const
export const SORT_VALUES = ['default', 'title-asc', 'title-desc', 'type', 'status'] as const

export type StatusTab = (typeof TAB_VALUES)[number]
export type TypeFilter = (typeof TYPE_VALUES)[number]
export type SortKey = (typeof SORT_VALUES)[number]

export interface TableQuery {
  tab: StatusTab
  type: TypeFilter
  search: string
  sort: SortKey
  page: number
}

export const DEFAULT_QUERY: TableQuery = { tab: 'all', type: 'all', search: '', sort: 'default', page: 1 }
export const PAGE_SIZE = 10

export interface TableView {
  visibleRows: DiscountRow[]
  counts: { all: number; active: number; inactive: number }
  matchCount: number
  page: number
  pageCount: number
  firstNumber: number
  lastNumber: number
}

const ACTIVE_WANTED = { all: [true, false], active: [true], inactive: [false] }
const KIND_WANTED = { all: ['tier', 'time'], tier: ['tier'], time: ['time'] }
const KIND_RANK = { tier: 0, time: 1 }

// The last value when a parameter is repeated in the address ("?tab=a&tab=b").
export function pickLastValue({ value }: { value: string | string[] | undefined }): string {
  const list = Array.isArray(value) ? value : [value]
  return list[list.length - 1] ?? ''
}

export function parseChoice<Value extends string>({ value, allowed, fallback }: { value: string; allowed: readonly Value[]; fallback: Value }): Value {
  return (allowed as readonly string[]).includes(value) ? (value as Value) : fallback
}

// A whole number of 1 or more, else page 1.
export function parsePageNumber({ value }: { value: string }): number {
  const page = Number(value)
  return Number.isInteger(page) && page >= 1 ? page : 1
}

export function parseTableQuery(options: {
  raw: Record<string, string | string[] | undefined>
  tools: Pick<typeof TABLE_TOOLS, 'pickLastValue' | 'parseChoice' | 'parsePageNumber'>
}): TableQuery {
  const { raw, tools } = options
  return {
    tab: tools.parseChoice({ value: tools.pickLastValue({ value: raw.tab }), allowed: TAB_VALUES, fallback: 'all' }),
    type: tools.parseChoice({ value: tools.pickLastValue({ value: raw.type }), allowed: TYPE_VALUES, fallback: 'all' }),
    search: tools.pickLastValue({ value: raw.search }).trim(),
    sort: tools.parseChoice({ value: tools.pickLastValue({ value: raw.sort }), allowed: SORT_VALUES, fallback: 'default' }),
    page: tools.parsePageNumber({ value: tools.pickLastValue({ value: raw.page }) }),
  }
}

export function filterByTab({ rows, tab }: { rows: DiscountRow[]; tab: StatusTab }): DiscountRow[] {
  const wanted = ACTIVE_WANTED[tab]
  const kept: DiscountRow[] = []
  for (const row of rows) {
    if (wanted.includes(row.isActive)) kept.push(row)
  }
  return kept
}

export function filterByType({ rows, type }: { rows: DiscountRow[]; type: TypeFilter }): DiscountRow[] {
  const wanted = KIND_WANTED[type]
  const kept: DiscountRow[] = []
  for (const row of rows) {
    if (wanted.includes(row.kind)) kept.push(row)
  }
  return kept
}

// Matches the row title, ignoring case; an empty search matches every row.
export function filterBySearch({ rows, search }: { rows: DiscountRow[]; search: string }): DiscountRow[] {
  const needle = search.trim().toLowerCase()
  const kept: DiscountRow[] = []
  for (const row of rows) {
    if (row.title.toLowerCase().includes(needle)) kept.push(row)
  }
  return kept
}

// The sorters never change the list they are given; equal rows keep their order.
export function sortByTitleAscending({ rows }: { rows: DiscountRow[] }): DiscountRow[] {
  return [...rows].sort((first, second) => first.title.localeCompare(second.title, 'en', { sensitivity: 'base' }))
}

export function sortByTitleDescending({ rows }: { rows: DiscountRow[] }): DiscountRow[] {
  return [...rows].sort((first, second) => second.title.localeCompare(first.title, 'en', { sensitivity: 'base' }))
}

export function sortByType({ rows }: { rows: DiscountRow[] }): DiscountRow[] {
  return [...rows].sort(
    (first, second) => KIND_RANK[first.kind] - KIND_RANK[second.kind] || first.title.localeCompare(second.title, 'en', { sensitivity: 'base' }),
  )
}

export function sortByStatus({ rows }: { rows: DiscountRow[] }): DiscountRow[] {
  return [...rows].sort(
    (first, second) => Number(second.isActive) - Number(first.isActive) || first.title.localeCompare(second.title, 'en', { sensitivity: 'base' }),
  )
}

// The default sort has no sorter: the stored order is kept.
export function sortRows({ rows, sort, sorters }: { rows: DiscountRow[]; sort: SortKey; sorters: Record<string, (options: { rows: DiscountRow[] }) => DiscountRow[]> }): DiscountRow[] {
  const sorter = sorters[sort]
  return sorter ? sorter({ rows }) : rows
}

export function countRows({ rows }: { rows: DiscountRow[] }): TableView['counts'] {
  const active = rows.filter((row) => row.isActive).length
  return { all: rows.length, active, inactive: rows.length - active }
}

// The page to show (clamped to the pages that exist) and the "Showing N-M" numbers.
export function computePaging(options: { matchCount: number; page: number; pageSize: number }) {
  const { matchCount, page, pageSize } = options
  const pageCount = Math.max(1, Math.ceil(matchCount / pageSize))
  const current = Math.min(Math.max(page, 1), pageCount)
  const startIndex = (current - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, matchCount)
  return { page: current, pageCount, startIndex, endIndex, firstNumber: matchCount === 0 ? 0 : startIndex + 1, lastNumber: endIndex }
}

export const TABLE_TOOLS = {
  pickLastValue,
  parseChoice,
  parsePageNumber,
  filterByTab,
  filterByType,
  filterBySearch,
  sortRows,
  countRows,
  computePaging,
  sorters: { 'title-asc': sortByTitleAscending, 'title-desc': sortByTitleDescending, type: sortByType, status: sortByStatus },
}

export function applyTableQuery(options: { rows: DiscountRow[]; query: TableQuery; tools: typeof TABLE_TOOLS }): TableView {
  const { rows, query, tools } = options
  const byTab = tools.filterByTab({ rows, tab: query.tab })
  const byType = tools.filterByType({ rows: byTab, type: query.type })
  const matches = tools.filterBySearch({ rows: byType, search: query.search })
  const sorted = tools.sortRows({ rows: matches, sort: query.sort, sorters: tools.sorters })
  const paging = tools.computePaging({ matchCount: sorted.length, page: query.page, pageSize: PAGE_SIZE })
  return {
    visibleRows: sorted.slice(paging.startIndex, paging.endIndex),
    counts: tools.countRows({ rows }),
    matchCount: sorted.length,
    page: paging.page,
    pageCount: paging.pageCount,
    firstNumber: paging.firstNumber,
    lastNumber: paging.lastNumber,
  }
}

// The address for a table state with some values changed. Default values are
// left out; any change except the page goes back to page 1.
export function buildTableHref({ query, changes }: { query: TableQuery; changes: Partial<TableQuery> }): string {
  const next: TableQuery = { ...query, page: 1, ...changes }
  const entries = Object.entries(next)
    .filter(([key, value]) => value !== DEFAULT_QUERY[key as keyof TableQuery])
    .map(([key, value]) => [key, String(value)])
  const text = new URLSearchParams(entries).toString()
  return text ? '/?' + text : '/'
}
