// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import StatCards from '@/home/components/StatCards'
import type { MetricCard } from '@/home/buildMetricCards'
import { listRangePresets } from '@/home/rangeDays'
import CreateCards from '@/home/components/CreateCards'
import TipBanner from '@/home/components/TipBanner'

afterEach(cleanup)

const CARDS: MetricCard[] = [
  { label: 'Visitors', value: '16', hint: 'Estimate of visitors' },
  { label: 'Bundle orders', value: '3', hint: 'Orders hint' },
  { label: 'AOV', value: '£21.50', hint: 'AOV hint' },
  { label: 'Added revenue', value: '£4.00', hint: 'Added hint' },
]

const RANGE = { label: 'Last 30 days', today: '2026-11-02', fromDay: '2026-10-04', toDay: '2026-11-02', presets: listRangePresets({ today: '2026-11-02' }), keep: '' }

describe('StatCards', () => {
  it('shows the label and value of each card it is given, in order, and the date button with the label of the range', () => {
    render(<StatCards cards={CARDS} range={RANGE} />)
    expect(screen.getByRole('button', { name: /Last 30 days/ })).toBeInTheDocument()
    const cards = screen.getAllByTestId('stat-card')
    const shown = cards.map((card) => [within(card).getByTestId('stat-label').textContent, within(card).getByTestId('stat-value').textContent])
    expect(shown).toEqual([['Visitors', '16'], ['Bundle orders', '3'], ['AOV', '£21.50'], ['Added revenue', '£4.00']])
  })

  it('gives each info icon the hint of its card', () => {
    render(<StatCards cards={CARDS} range={RANGE} />)
    for (const card of CARDS) expect(screen.getByTitle(card.hint)).toBeInTheDocument()
  })
})

describe('CreateCards', () => {
  it('links the create button to the new-discount page', () => {
    render(<CreateCards />)
    expect(screen.getByRole('link', { name: /Create Discount/ })).toHaveAttribute('href', '/discounts/new')
  })

  it('is one row: the illustration, the title and one line of description, and the button, with no tag and no "More information" link', () => {
    render(<CreateCards />)
    expect(screen.getByRole('heading', { level: 2, name: 'Tier-based Discount' })).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.queryByText('More information')).toBeNull()
    expect(screen.getAllByText(/Tier-based/i)).toHaveLength(1)
  })

  it('cuts the description to one line with an ellipsis, and keeps the button from shrinking', () => {
    render(<CreateCards />)
    const description = screen.getByText('Reward bigger orders. Offer percentage off or a fixed price as customers add more units of a product.')
    expect(description).toHaveClass('truncate')
    expect(screen.getByRole('link', { name: /Create Discount/ })).toHaveClass('shrink-0')
  })

  it('uses the illustration of the design as it is, at its real size', () => {
    render(<CreateCards />)
    const tier = screen.getByAltText('Tier-based discount concept illustration')
    expect(tier).toHaveAttribute('src', '/assets/home/tier-illustration.jpg')
    expect(tier).toHaveAttribute('width', '512')
    expect(tier).toHaveAttribute('height', '286')
  })
})

describe('TipBanner', () => {
  it('shows the tip with a link that goes nowhere yet', () => {
    render(<TipBanner />)
    expect(screen.getByText('Did you know?')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings > Visual badges' })).toHaveAttribute('href', '#')
  })
})
