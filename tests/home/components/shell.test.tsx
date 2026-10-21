// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import fs from 'node:fs'
import path from 'node:path'
import HomeHeader from '@/home/components/HomeHeader'
import HomeFooter from '@/home/components/HomeFooter'
import * as icons from '@/home/components/icons'

afterEach(cleanup)

describe('HomeHeader', () => {
  it('shows the "ST" mark and the app name from the design', () => {
    render(<HomeHeader />)
    expect(screen.getByText('ST')).toBeInTheDocument()
    expect(screen.getByText('Smooth Discounts')).toBeInTheDocument()
  })
})

describe('HomeFooter', () => {
  it('shows the app name with the given version and three links that go nowhere yet', () => {
    render(<HomeFooter version="1.2.3" />)
    expect(screen.getByText('Smooth Discounts v1.2.3')).toBeInTheDocument()
    for (const name of ['Privacy', 'Support', 'Shopify App Store']) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', '#')
    }
  })
})

describe('icons', () => {
  const iconNames = [
    'CalendarIcon', 'InfoIcon', 'LayersIcon', 'ScheduleIcon', 'FilterListIcon', 'SwapVertIcon',
    'SearchIcon', 'ChevronLeftIcon', 'ChevronRightIcon', 'ArrowForwardIcon', 'LightbulbIcon', 'TierTypeIcon', 'TimeTypeIcon',
  ] as const

  it.each(iconNames)('%s renders a decorative svg that takes a class name', (name) => {
    const Icon = icons[name]
    const { container } = render(<Icon className="extra-class" />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveClass('extra-class')
    expect(svg).toHaveClass('home-icon')
  })
})

describe('home.css', () => {
  const css = fs.readFileSync(path.join(__dirname, '../../../src/home/home.css'), 'utf8')

  it.each([
    ['--color-home-primary', '#173028'],
    ['--color-home-primary-container', '#2d463e'],
    ['--color-home-surface', '#fbf9f4'],
    ['--color-home-surface-container-lowest', '#ffffff'],
    ['--color-home-outline-variant', '#c2c8c4'],
    ['--color-home-secondary', '#8b4f2f'],
    ['--color-home-tertiary-fixed', '#dae8be'],
  ])('defines %s as %s', (token, value) => {
    expect(css).toContain(token + ': ' + value)
  })

  it('reads the font variable where the font class is used (a plain @theme value would be resolved at the root, where next/font has not set it)', () => {
    expect(css).toMatch(/@theme inline \{[^}]*--font-home: var\(--font-inter\)/)
  })

  it('does not change the colours of any other page (tokens are all prefixed home-)', () => {
    const colorTokens = css.match(/--color-[a-z0-9-]+/g) ?? []
    expect(colorTokens.length).toBeGreaterThan(40)
    expect(colorTokens.every((token) => token.startsWith('--color-home-'))).toBe(true)
  })
})
