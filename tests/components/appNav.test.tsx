// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import AppNav from '@/components/AppNav'

afterEach(cleanup)

describe('AppNav', () => {
  it("is Shopify's app navigation with one link for the discounts and one for Settings", () => {
    const { container } = render(<AppNav />)
    const nav = container.querySelector('s-app-nav') as HTMLElement
    expect(nav).not.toBeNull()
    const links = [...nav.querySelectorAll('s-link')]
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Discounts', '/'],
      ['Settings', '/settings'],
    ])
  })

  it('marks the discounts page as the home of the app, so only Settings is added to the menu', () => {
    const { container } = render(<AppNav />)
    const home = container.querySelectorAll('s-link[rel="home"]')
    expect(home).toHaveLength(1)
    expect(home[0]).toHaveAttribute('href', '/')
  })
})
