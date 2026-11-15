// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import PreviewTabs from '@/settings/components/PreviewTabs'

afterEach(cleanup)

describe('PreviewTabs', () => {
  it('has two tabs, Storefront Widget and Pre-Checkout Popup, and marks the chosen one', () => {
    render(<PreviewTabs selected="widget" onSelect={() => {}} />)
    expect(screen.getByRole('tablist', { name: 'Preview' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Storefront Widget', 'Pre-Checkout Popup'])
    expect(screen.getByRole('tab', { name: 'Storefront Widget' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Pre-Checkout Popup' })).toHaveAttribute('aria-selected', 'false')
  })

  it('reports the tab that is pressed', () => {
    const onSelect = vi.fn()
    render(<PreviewTabs selected="widget" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Pre-Checkout Popup' }))
    expect(onSelect).toHaveBeenCalledWith('popup')
  })

  it('points each tab at its panel', () => {
    render(<PreviewTabs selected="popup" onSelect={() => {}} />)
    expect(screen.getByRole('tab', { name: 'Storefront Widget' })).toHaveAttribute('aria-controls', 'preview-panel-widget')
    expect(screen.getByRole('tab', { name: 'Pre-Checkout Popup' })).toHaveAttribute('aria-controls', 'preview-panel-popup')
    expect(screen.getByRole('tab', { name: 'Pre-Checkout Popup' })).toHaveAttribute('aria-selected', 'true')
  })

  it('looks like the status tabs on the homepage: a warm grey pill bar with a white pill for the chosen tab, and no icons', () => {
    render(<PreviewTabs selected="popup" onSelect={() => {}} />)
    const bar = screen.getByRole('tablist', { name: 'Preview' })
    expect(bar).toHaveClass('inline-flex', 'p-1', 'rounded-lg', 'bg-home-surface-container', 'text-xs')
    const chosen = screen.getByRole('tab', { name: 'Pre-Checkout Popup' })
    expect(chosen).toHaveClass('bg-home-surface-container-lowest', 'text-home-primary', 'font-semibold', 'rounded-md')
    const idle = screen.getByRole('tab', { name: 'Storefront Widget' })
    expect(idle).toHaveClass('text-home-on-surface-variant', 'font-medium')
    expect(idle).not.toHaveClass('bg-home-surface-container-lowest')
    expect(bar.querySelectorAll('svg')).toHaveLength(0)
  })
})
