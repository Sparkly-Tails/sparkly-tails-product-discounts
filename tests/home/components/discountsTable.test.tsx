// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom/vitest'

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: router.push }) }))

import DiscountsTable from '@/home/components/DiscountsTable'
import { DEFAULT_QUERY, TABLE_TOOLS, applyTableQuery, type TableQuery } from '@/home/tableQuery'
import type { DiscountRow } from '@/home/discountRows'

beforeEach(() => router.push.mockReset())
afterEach(cleanup)

function makeRow({ id, kind, title, isActive, subtitle = '', rules = '' }: { id: string; kind: 'tier' | 'time'; title: string; isActive: boolean; subtitle?: string; rules?: string }): DiscountRow {
  const base = kind === 'tier' ? '/discounts/' : '/time-discounts/'
  return { key: kind + ':' + id, kind, title, subtitle, rules, isActive, href: base + id }
}

const SIX: DiscountRow[] = [
  makeRow({ id: 'a1', kind: 'tier', title: 'Buy more, save more - Salmon Oil', isActive: true, subtitle: 'Save on salmon', rules: '3+ units (10% off), 5+ units (20% off)' }),
  makeRow({ id: 'a2', kind: 'tier', title: 'Joint Support 3-pack', isActive: true, rules: '3+ units (£64.00 each)' }),
  makeRow({ id: 'a3', kind: 'tier', title: 'Calming Chews bulk', isActive: false }),
  makeRow({ id: 'b1', kind: 'time', title: 'Black Friday 2026 weekend', isActive: false, rules: 'Nov 27, 2026 - Nov 30, 2026 (Scheduled)' }),
  makeRow({ id: 'b2', kind: 'time', title: 'Spring Probiotic Sale', isActive: true, rules: 'Ends Nov 30, 2026' }),
  makeRow({ id: 'b3', kind: 'time', title: 'Summer Sale', isActive: false, rules: 'Ended Aug 31, 2025' }),
]
const TWELVE: DiscountRow[] = Array.from({ length: 12 }, (_value, index) => makeRow({ id: 'x' + index, kind: 'tier', title: 'Discount ' + String(index + 1).padStart(2, '0'), isActive: true }))

function show({ rows = SIX, changes = {} }: { rows?: DiscountRow[]; changes?: Partial<TableQuery> } = {}) {
  const query = { ...DEFAULT_QUERY, ...changes }
  const view = applyTableQuery({ rows, query, tools: TABLE_TOOLS })
  return render(<DiscountsTable view={view} query={query} />)
}

describe('DiscountsTable header and tabs', () => {
  it('has the title and description of the design', () => {
    show()
    expect(screen.getByRole('heading', { name: 'All discounts' })).toBeInTheDocument()
    expect(screen.getByText('Manage active tier quantity breaks and scheduled promotional pricing.')).toBeInTheDocument()
  })

  it('shows the tabs with the counts of all discounts, as links that keep the other settings', () => {
    show({ changes: { type: 'time' } })
    const all = screen.getByRole('link', { name: /^All\s*6$/ })
    const active = screen.getByRole('link', { name: /^Active\s*3$/ })
    const inactive = screen.getByRole('link', { name: /^Inactive\s*3$/ })
    expect(all).toHaveAttribute('href', '/?type=time')
    expect(active).toHaveAttribute('href', '/?tab=active&type=time')
    expect(inactive).toHaveAttribute('href', '/?tab=inactive&type=time')
    expect(all).toHaveAttribute('aria-current', 'page')
    expect(active).not.toHaveAttribute('aria-current')
  })

  it('marks the tab that is open', () => {
    show({ changes: { tab: 'inactive' } })
    expect(screen.getByRole('link', { name: /^Inactive/ })).toHaveAttribute('aria-current', 'page')
  })
})

describe('DiscountsTable search, filter and sort controls', () => {
  it('has a search box with the current text and the placeholder of the design', () => {
    show({ changes: { search: 'salmon' } })
    const input = screen.getByLabelText('Search discounts') as HTMLInputElement
    expect(input.value).toBe('salmon')
    expect(input).toHaveAttribute('placeholder', 'Search discounts...')
  })

  it('searches without a page load: submitting goes to the address with the text and keeps the tab, type and sort', async () => {
    const user = userEvent.setup()
    show({ changes: { tab: 'active', type: 'tier', sort: 'status' } })
    await user.type(screen.getByLabelText('Search discounts'), '  Salmon Oil {enter}')
    expect(router.push).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith('/?tab=active&type=tier&search=Salmon+Oil&sort=status')
  })

  it('clears the search by submitting an empty box, and goes back to the first page', async () => {
    const user = userEvent.setup()
    show({ rows: TWELVE, changes: { search: 'discount', page: 2 } })
    await user.clear(screen.getByLabelText('Search discounts'))
    await user.type(screen.getByLabelText('Search discounts'), '{enter}')
    expect(router.push).toHaveBeenCalledWith('/')
  })

  it('keeps the Filters panel closed until the button is pressed', async () => {
    const user = userEvent.setup()
    show()
    const button = screen.getByRole('button', { name: 'Filters' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Time-based')).toBeNull()
    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('All types')).toBeChecked()
  })

  it('shows the current type as checked in the Filters panel', async () => {
    const user = userEvent.setup()
    show({ changes: { type: 'time' } })
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    expect(screen.getByLabelText('Time-based')).toBeChecked()
    expect(screen.getByLabelText('Tier-based')).not.toBeChecked()
  })

  it('applies a type without a page load and keeps the tab, search and sort', async () => {
    const user = userEvent.setup()
    show({ changes: { tab: 'active', search: 'sale', sort: 'type' } })
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    await user.click(screen.getByLabelText('Time-based'))
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(router.push).toHaveBeenCalledWith('/?tab=active&type=time&search=sale&sort=type')
  })

  it('closes the Filters panel with Escape', async () => {
    const user = userEvent.setup()
    show()
    await user.click(screen.getByRole('button', { name: 'Filters' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByLabelText('All types')).toBeNull()
  })

  it('opens the Sort menu with five links, marking the current order', async () => {
    const user = userEvent.setup()
    show({ changes: { sort: 'type' } })
    const button = screen.getByRole('button', { name: 'Sort' })
    expect(screen.queryByRole('link', { name: 'Title A-Z' })).toBeNull()
    await user.click(button)
    const links = ['Default order', 'Title A-Z', 'Title Z-A', 'Type', 'Status'].map((name) => screen.getByRole('link', { name }))
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/', '/?sort=title-asc', '/?sort=title-desc', '/?sort=type', '/?sort=status'])
    expect(links[3]).toHaveAttribute('aria-current', 'true')
    expect(links[0]).not.toHaveAttribute('aria-current')
  })

  it('closes the Sort menu again when the button is pressed a second time', async () => {
    const user = userEvent.setup()
    show()
    const button = screen.getByRole('button', { name: 'Sort' })
    await user.click(button)
    await user.click(button)
    expect(screen.queryByRole('link', { name: 'Title A-Z' })).toBeNull()
  })
})

describe('DiscountsTable rows', () => {
  it('shows one row per discount with title, type, status and rules', () => {
    show()
    const rows = screen.getAllByTestId('discount-row')
    expect(rows).toHaveLength(6)
    const first = within(rows[0])
    expect(first.getByRole('link', { name: /Buy more, save more - Salmon Oil/ })).toHaveAttribute('href', '/discounts/a1')
    expect(first.getByText('Save on salmon')).toBeInTheDocument()
    expect(first.getByText('Active')).toBeInTheDocument()
    expect(first.getByText('3+ units (10% off), 5+ units (20% off)')).toBeInTheDocument()
    expect(rows[0].querySelector('[data-kind="tier"]')).not.toBeNull()
    const fourth = within(rows[3])
    expect(fourth.getByRole('link', { name: /Black Friday 2026 weekend/ })).toHaveAttribute('href', '/time-discounts/b1')
    expect(fourth.getByText('Inactive')).toBeInTheDocument()
    expect(rows[3].querySelector('[data-kind="time"]')).not.toBeNull()
  })

  it('shows no second line for a discount without a subtitle', () => {
    show()
    const rows = screen.getAllByTestId('discount-row')
    expect(within(rows[1]).queryByTestId('row-subtitle')).toBeNull()
  })

  it('has the column headings of the design', () => {
    show()
    const headings = screen.getAllByRole('columnheader').map((cell) => cell.textContent)
    expect(headings).toEqual(['Discount title', 'Type', 'Status', 'Schedule / Rules', ''])
  })
})

const FOUR = SIX.slice(0, 4)
const FIVE = SIX.slice(0, 5)

describe('DiscountsTable pagination', () => {
  it('is left out when there are fewer than 5 discounts', () => {
    show({ rows: FOUR })
    expect(screen.queryByTestId('showing')).toBeNull()
    expect(screen.queryByText('Previous')).toBeNull()
    expect(screen.getAllByTestId('discount-row')).toHaveLength(4)
  })

  it('is shown from 5 discounts on', () => {
    show({ rows: FIVE })
    expect(screen.getByTestId('showing').textContent).toBe('Showing 1–5 of 5 discounts')
  })

  it('is left out when a search leaves fewer than 5 discounts', () => {
    show({ changes: { search: 'sale' } })
    expect(screen.queryByTestId('showing')).toBeNull()
  })

  it('on a single page shows "Showing 1–6 of 6 discounts" with Previous and Next switched off', () => {
    show()
    expect(screen.getByTestId('showing').textContent).toBe('Showing 1–6 of 6 discounts')
    expect(screen.getByText('Previous').closest('[aria-disabled="true"]')).not.toBeNull()
    expect(screen.getByText('Next').closest('[aria-disabled="true"]')).not.toBeNull()
  })

  it('on the first of two pages Next is a link to page 2 and Previous is switched off', () => {
    show({ rows: TWELVE })
    expect(screen.getByTestId('showing').textContent).toBe('Showing 1–10 of 12 discounts')
    expect(screen.getByRole('link', { name: /Next/ })).toHaveAttribute('href', '/?page=2')
    expect(screen.getByText('Previous').closest('[aria-disabled="true"]')).not.toBeNull()
  })

  it('on the second page shows "Showing 11–12 of 12 discounts" and Previous goes back to the first page', () => {
    show({ rows: TWELVE, changes: { page: 2, tab: 'active' } })
    expect(screen.getByTestId('showing').textContent).toBe('Showing 11–12 of 12 discounts')
    expect(screen.getByRole('link', { name: /Previous/ })).toHaveAttribute('href', '/?tab=active')
    expect(screen.getByText('Next').closest('[aria-disabled="true"]')).not.toBeNull()
  })
})

describe('DiscountsTable empty states', () => {
  it('says there are no discounts yet when the shop has none, with the tabs at 0 and no pagination', () => {
    show({ rows: [] })
    expect(screen.getByText('No discounts yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^All\s*0$/ })).toBeInTheDocument()
    expect(screen.queryByTestId('showing')).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('says nothing matches, with a link that clears the search and filters, and keeps the real tab counts', () => {
    show({ changes: { search: 'no such thing' } })
    expect(screen.getByText('No discounts match your search or filters.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /^All\s*6$/ })).toBeInTheDocument()
    expect(screen.queryByTestId('showing')).toBeNull()
  })
})
