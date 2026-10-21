// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import StatCards from '@/home/components/StatCards'
import CreateCards from '@/home/components/CreateCards'
import TipBanner from '@/home/components/TipBanner'

afterEach(cleanup)

describe('StatCards', () => {
  it('shows the four labels with the sample values of the design, in order, and the "Last 30d" button', () => {
    render(<StatCards />)
    expect(screen.getByRole('button', { name: /Last 30d/ })).toBeInTheDocument()
    const cards = screen.getAllByTestId('stat-card')
    const shown = cards.map((card) => [within(card).getByTestId('stat-label').textContent, within(card).getByTestId('stat-value').textContent])
    expect(shown).toEqual([['Visitors', '16'], ['Bundle orders', '0'], ['AOV', '0.00'], ['Added revenue', '0.00']])
  })

  it('gives each info icon the hint text of the design', () => {
    render(<StatCards />)
    expect(screen.getByTitle('Total visitors in period')).toBeInTheDocument()
    expect(screen.getByTitle('Total bundle orders placed')).toBeInTheDocument()
    expect(screen.getByTitle('Average order value with discount')).toBeInTheDocument()
    expect(screen.getByTitle('Incremental revenue generated')).toBeInTheDocument()
  })
})

describe('CreateCards', () => {
  it('links the two create buttons to the existing new-discount pages', () => {
    render(<CreateCards />)
    expect(screen.getByRole('link', { name: /Create tier discount/ })).toHaveAttribute('href', '/discounts/new')
    expect(screen.getByRole('link', { name: /Create tier time discount/ })).toHaveAttribute('href', '/time-discounts/new')
  })

  it('leaves both "More information" links without a destination', () => {
    render(<CreateCards />)
    const links = screen.getAllByRole('link', { name: 'More information' })
    expect(links).toHaveLength(2)
    for (const link of links) expect(link).toHaveAttribute('href', '#')
  })

  it('uses the two illustrations of the design as they are, at their real size', () => {
    render(<CreateCards />)
    const tier = screen.getByAltText('Tier-based discount concept illustration')
    const time = screen.getByAltText('Time-based discount concept illustration')
    expect(tier).toHaveAttribute('src', '/assets/home/tier-illustration.jpg')
    expect(time).toHaveAttribute('src', '/assets/home/time-illustration.jpg')
    expect(tier).toHaveAttribute('width', '512')
    expect(tier).toHaveAttribute('height', '286')
  })

  it('has the copy of the design', () => {
    render(<CreateCards />)
    expect(screen.getByText('Reward bigger orders. Offer percentage off or a fixed price as customers add more units of a product.')).toBeInTheDocument()
    expect(screen.getByText('Tier discount with time limit')).toBeInTheDocument()
    expect(screen.getByText(/Run a tier discounts on a schedule/)).toBeInTheDocument()
  })
})

describe('TipBanner', () => {
  it('shows the tip with a link that goes nowhere yet', () => {
    render(<TipBanner />)
    expect(screen.getByText('Did you know?')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings > Visual badges' })).toHaveAttribute('href', '#')
  })
})
