import { describe, it, expect } from 'vitest'
import {
  DEFAULT_QUERY,
  PAGE_SIZE,
  TABLE_TOOLS,
  applyTableQuery,
  buildTableHref,
  parseTableQuery,
  type TableQuery,
} from '@/home/tableQuery'
import type { DiscountRow } from '@/home/discountRows'

function makeRow({ id, kind, title, isActive }: { id: string; kind: 'tier' | 'time'; title: string; isActive: boolean }): DiscountRow {
  return { key: kind + ':' + id, kind, title, subtitle: '', rules: '', isActive, href: '/x/' + id }
}

// 12 rows in stored order: tier rows first, then time rows; mixed activity, case, accents and a repeated title.
const ROWS: DiscountRow[] = [
  makeRow({ id: 't1', kind: 'tier', title: 'Salmon Oil', isActive: true }),
  makeRow({ id: 't2', kind: 'tier', title: 'joint support', isActive: true }),
  makeRow({ id: 't3', kind: 'tier', title: 'Calming Chews', isActive: false }),
  makeRow({ id: 't4', kind: 'tier', title: 'Café Bundle', isActive: true }),
  makeRow({ id: 't5', kind: 'tier', title: 'Calming Chews', isActive: true }),
  makeRow({ id: 't6', kind: 'tier', title: 'Zinc Tabs', isActive: false }),
  makeRow({ id: 'm1', kind: 'time', title: 'Black Friday', isActive: false }),
  makeRow({ id: 'm2', kind: 'time', title: 'Spring Sale', isActive: true }),
  makeRow({ id: 'm3', kind: 'time', title: 'Summer Sale', isActive: false }),
  makeRow({ id: 'm4', kind: 'time', title: 'Winter Sale', isActive: true }),
  makeRow({ id: 'm5', kind: 'time', title: 'Easter', isActive: false }),
  makeRow({ id: 'm6', kind: 'time', title: '100% & more', isActive: true }),
]

const run = (changes: Partial<TableQuery>) => applyTableQuery({ rows: ROWS, query: { ...DEFAULT_QUERY, ...changes }, tools: TABLE_TOOLS })
const keys = (rows: DiscountRow[]) => rows.map((row) => row.key.split(':')[1])

describe('parseTableQuery', () => {
  const parse = (raw: Record<string, string | string[] | undefined>) => parseTableQuery({ raw, tools: TABLE_TOOLS })

  it('gives the defaults when nothing is in the address', () => {
    expect(parse({})).toEqual(DEFAULT_QUERY)
  })

  it('reads valid values', () => {
    expect(parse({ tab: 'inactive', type: 'time', search: '  Sale ', sort: 'title-desc', page: '3' })).toEqual({
      tab: 'inactive', type: 'time', search: 'Sale', sort: 'title-desc', page: 3,
    })
  })

  it.each([
    ['page=0', { page: '0' }],
    ['page=-3', { page: '-3' }],
    ['page=abc', { page: 'abc' }],
    ['page=2.5', { page: '2.5' }],
    ['page empty', { page: '' }],
  ])('falls back to page 1 for %s', (_label, raw) => {
    expect(parse(raw).page).toBe(1)
  })

  it('falls back to the default for unknown tab, type and sort values', () => {
    expect(parse({ tab: 'bogus', type: 'x', sort: 'newest' })).toEqual(DEFAULT_QUERY)
  })

  it('uses the last value of a repeated parameter', () => {
    expect(parse({ tab: ['active', 'inactive'] }).tab).toBe('inactive')
    expect(parse({ page: ['1', '2'] }).page).toBe(2)
  })
})

describe('applyTableQuery', () => {
  it('counts all discounts whatever the search, tab or filter is', () => {
    const counts = { all: 12, active: 7, inactive: 5 }
    expect(run({}).counts).toEqual(counts)
    expect(run({ search: 'sale', tab: 'active', type: 'tier' }).counts).toEqual(counts)
  })

  it('keeps the stored order by default and shows only the first page', () => {
    const view = run({})
    expect(keys(view.visibleRows)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6', 'm1', 'm2', 'm3', 'm4'])
    expect([view.matchCount, view.pageCount, view.page, view.firstNumber, view.lastNumber]).toEqual([12, 2, 1, 1, 10])
  })

  it('filters by tab', () => {
    expect(keys(run({ tab: 'active' }).visibleRows)).toEqual(['t1', 't2', 't4', 't5', 'm2', 'm4', 'm6'])
    expect(run({ tab: 'inactive' }).matchCount).toBe(5)
  })

  it('filters by type', () => {
    expect(run({ type: 'time' }).matchCount).toBe(6)
    expect(run({ type: 'tier' }).visibleRows.every((row) => row.kind === 'tier')).toBe(true)
  })

  it('combines tab, type and search', () => {
    expect(keys(run({ tab: 'active', type: 'time', search: 'sale' }).visibleRows)).toEqual(['m2', 'm4'])
  })

  it('matches the search ignoring case and surrounding spaces, and reads the text literally', () => {
    expect(keys(run({ search: 'SALMON' }).visibleRows)).toEqual(['t1'])
    expect(keys(run({ search: 'café' }).visibleRows)).toEqual(['t4'])
    expect(keys(run({ search: '100% & more' }).visibleRows)).toEqual(['m6'])
  })

  it('sorts by title A-Z and Z-A ignoring case, keeping the stored order for equal titles', () => {
    const ascending = keys(run({ sort: 'title-asc', page: 1 }).visibleRows)
    expect(ascending.slice(0, 5)).toEqual(['m6', 'm1', 't4', 't3', 't5'])
    const descending = keys(run({ sort: 'title-desc', page: 1 }).visibleRows)
    expect(descending.slice(0, 3)).toEqual(['t6', 'm4', 'm3'])
  })

  it('sorts by type with tier-based discounts first, then by title', () => {
    expect(keys(run({ sort: 'type', type: 'all' }).visibleRows).slice(0, 6)).toEqual(['t4', 't3', 't5', 't2', 't1', 't6'])
  })

  it('sorts by status with Active first, then by title', () => {
    const view = run({ sort: 'status' })
    expect(view.visibleRows.slice(0, 7).every((row) => row.isActive)).toBe(true)
    expect(view.visibleRows.slice(7).every((row) => !row.isActive)).toBe(true)
  })

  it('shows the second page with "Showing 11-12 of 12"', () => {
    const view = run({ page: 2 })
    expect(keys(view.visibleRows)).toEqual(['m5', 'm6'])
    expect([view.firstNumber, view.lastNumber, view.matchCount]).toEqual([11, 12, 12])
  })

  it('uses the last page when the page is beyond the end', () => {
    const view = run({ page: 999 })
    expect([view.page, keys(view.visibleRows)]).toEqual([2, ['m5', 'm6']])
  })

  it('has one empty page, with numbers 0, when nothing matches', () => {
    const view = run({ search: 'no such discount' })
    expect([view.visibleRows, view.pageCount, view.page, view.firstNumber, view.lastNumber, view.matchCount]).toEqual([[], 1, 1, 0, 0, 0])
    expect(view.counts.all).toBe(12)
  })

  it('handles a store without any discount', () => {
    const view = applyTableQuery({ rows: [], query: DEFAULT_QUERY, tools: TABLE_TOOLS })
    expect([view.visibleRows, view.counts, view.pageCount, view.firstNumber, view.lastNumber]).toEqual([[], { all: 0, active: 0, inactive: 0 }, 1, 0, 0])
  })

  it('does not change the list it was given', () => {
    const before = keys(ROWS)
    run({ sort: 'title-desc' })
    expect(keys(ROWS)).toEqual(before)
  })

  it('uses a page size of 10', () => {
    expect(PAGE_SIZE).toBe(10)
  })
})

describe('buildTableHref', () => {
  const href = (changes: Partial<TableQuery>, query: TableQuery = DEFAULT_QUERY) => buildTableHref({ query, changes })
  const roundTrip = (link: string) => parseTableQuery({ raw: Object.fromEntries(new URLSearchParams(link.split('?')[1] ?? '')), tools: TABLE_TOOLS })

  it('is the bare address when everything is the default', () => {
    expect(href({})).toBe('/')
  })

  it('leaves out default values', () => {
    expect(href({ tab: 'active' })).toBe('/?tab=active')
  })

  it('goes back to page 1 when anything but the page changes', () => {
    expect(href({ tab: 'inactive' }, { ...DEFAULT_QUERY, page: 3 })).toBe('/?tab=inactive')
  })

  it('keeps the other values when only the page changes', () => {
    expect(href({ page: 2 }, { ...DEFAULT_QUERY, tab: 'active', sort: 'type' })).toBe('/?tab=active&sort=type&page=2')
  })

  it.each(['100% & more', 'a+b', "'quote'", 'café', 'two words'])('round-trips the search text %s through the address', (text) => {
    const link = href({ search: text })
    expect(roundTrip(link).search).toBe(text)
  })
})
