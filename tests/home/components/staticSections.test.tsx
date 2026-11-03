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

const RANGE = { label: 'Last 30 days', today: '2026-11-02', presets: listRangePresets({ today: '2026-11-02' }), keep: '' }

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
    expect(screen.getByRole('link', { name: /Create tier discount/ })).toHaveAttribute('href', '/discounts/new')
  })

  it('leaves the "More information" link without a destination', () => {
    render(<CreateCards />)
    const links = screen.getAllByRole('link', { name: 'More information' })
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '#')
  })

  it('uses the illustration of the design as it is, at its real size', () => {
    render(<CreateCards />)
    const tier = screen.getByAltText('Tier-based discount concept illustration')
    expect(tier).toHaveAttribute('src', '/assets/home/tier-illustration.jpg')
    expect(tier).toHaveAttribute('width', '512')
    expect(tier).toHaveAttribute('height', '286')
  })

  it('has the copy of the design', () => {
    render(<CreateCards />)
    expect(screen.getByText('Reward bigger orders. Offer percentage off or a fixed price as customers add more units of a product.')).toBeInTheDocument()
  })
})

describe('TipBanner', () => {
  it('shows the tip with a link that goes nowhere yet', () => {
    render(<TipBanner />)
    expect(screen.getByText('Did you know?')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings > Visual badges' })).toHaveAttribute('href', '#')
  })
})
