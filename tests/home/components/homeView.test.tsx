// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/home/homeFont', () => ({ homeFont: { variable: 'inter-variable' } }))

import HomeView from '@/home/components/HomeView'
import { DEFAULT_QUERY, TABLE_TOOLS, applyTableQuery } from '@/home/tableQuery'

afterEach(cleanup)

const ROWS = [{ key: 'tier:a', kind: 'tier' as const, title: 'Salmon Oil', subtitle: '', rules: '3+ units (10% off)', isActive: true, href: '/discounts/a' }]

function show() {
  const view = applyTableQuery({ rows: ROWS, query: DEFAULT_QUERY, tools: TABLE_TOOLS })
  return render(<HomeView view={view} query={DEFAULT_QUERY} version="9.8.7" />)
}

describe('HomeView', () => {
  it('shows the sections of the design in order: header, title, number cards, create cards, table, tip, footer', () => {
    const { container } = show()
    const order = ['Smooth Discounts', 'Discounts', 'Visitors', 'Create tier discount', 'All discounts', 'Did you know?', 'Smooth Discounts v9.8.7']
    const text = container.textContent ?? ''
    const positions = order.map((part) => text.indexOf(part))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect([...positions].sort((first, second) => first - second)).toEqual(positions)
  })

  it('has the page title as the one level-one heading and shows the real rows', () => {
    show()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Discounts')
    expect(screen.getByRole('link', { name: 'Salmon Oil' })).toHaveAttribute('href', '/discounts/a')
  })

  it('puts the font variable and the light palette on the page wrapper', () => {
    const { container } = show()
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper).toHaveClass('inter-variable', 'font-home', 'bg-home-surface', 'text-home-on-surface')
  })
})
