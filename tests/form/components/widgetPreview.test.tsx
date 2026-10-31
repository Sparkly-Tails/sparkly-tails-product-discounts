// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import WidgetPreview from '@/form/preview/components/WidgetPreview'

const NOW = 1_800_000_000
const SALMON = { title: 'Wild Alaskan Salmon Oil for Dogs (16 fl oz)', price: 28, imageUrl: null }
const CHEWS = { title: 'Canine Vitality Joint Support Chews (90 Chews)', price: 40, imageUrl: null }
const TIERS = [{ minQty: 3, percentOff: 10 }, { minQty: 5, percentOff: 15 }]

function renderPreview(overrides: Partial<Parameters<typeof WidgetPreview>[0]> = {}) {
  return render(<WidgetPreview products={[SALMON, CHEWS]} tiers={TIERS} flash={null} highDemand={false} timeZone="UTC" currencyCode="USD" initialNowSeconds={NOW} {...overrides} />)
}

beforeEach(() => vi.useFakeTimers({ now: NOW * 1000 }))
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('WidgetPreview', () => {
  it('shows the Preview heading, that it is a live view, and the touch note', () => {
    renderPreview()
    expect(screen.getByRole('heading', { level: 2, name: 'Preview' })).toBeInTheDocument()
    expect(screen.getByText('Live storefront view')).toBeInTheDocument()
    expect(screen.getByText('Tapping options changes preview state in real-time')).toBeInTheDocument()
  })

  it('asks for a product when none is chosen, and shows no product list', () => {
    renderPreview({ products: [] })
    expect(screen.getByText('Add a product to see the preview')).toBeInTheDocument()
    expect(screen.queryByLabelText('Product previewing:')).toBeNull()
    expect(document.querySelector('.sparkly-tier-pricing')).toBeNull()
  })

  it('shows the widget for the first product, with a list of the products to preview', () => {
    renderPreview()
    const select = screen.getByLabelText('Product previewing:')
    expect(Array.from(select.querySelectorAll('option')).map((option) => option.textContent)).toEqual([SALMON.title, CHEWS.title])
    expect(document.querySelector('[data-tier-pricing-price]')).toHaveTextContent('$28.00')
  })

  it('shows another product when it is chosen from the list', () => {
    renderPreview()
    fireEvent.change(screen.getByLabelText('Product previewing:'), { target: { value: '1' } })
    expect(document.querySelector('[data-tier-pricing-price]')).toHaveTextContent('$40.00')
  })

  it('moves to the tier whose chip is clicked', () => {
    renderPreview()
    fireEvent.click(screen.getByRole('button', { name: '3 × $75.60' }))
    expect(document.querySelector('[data-tier-pricing-price]')).toHaveTextContent('$25.20')
    expect(screen.getByRole('button', { name: /3 × \$75\.60/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps a product in view when the one being previewed is removed', () => {
    const { rerender } = renderPreview()
    fireEvent.change(screen.getByLabelText('Product previewing:'), { target: { value: '1' } })
    rerender(<WidgetPreview products={[SALMON]} tiers={TIERS} flash={null} highDemand={false} timeZone="UTC" currencyCode="USD" initialNowSeconds={NOW} />)
    expect(document.querySelector('[data-tier-pricing-price]')).toHaveTextContent('$28.00')
  })

  it('writes prices in the shop currency', () => {
    renderPreview({ currencyCode: 'GBP' })
    expect(document.querySelector('[data-tier-pricing-price]')).toHaveTextContent('£28.00')
  })

  it('counts a flash sale down, second by second, in the shop time zone', () => {
    renderPreview({ flash: { startsAt: '2026-10-30T09:00', endsAt: '2027-01-15T10:00', showTeaser: true }, initialNowSeconds: Date.parse('2027-01-15T07:00:00Z') / 1000 })
    const digits = () => Array.from(document.querySelectorAll('.sparkly-tier-pricing__flash-digit')).map((digit) => digit.textContent)
    expect(digits()).toEqual(['03', '00', '00'])
    act(() => { vi.advanceTimersByTime(1000) })
    expect(digits()).toEqual(['02', '59', '59'])
  })

  it('shows the teaser for a sale that starts later', () => {
    renderPreview({ flash: { startsAt: '2030-01-01T09:00', endsAt: '2030-01-02T09:00', showTeaser: true } })
    expect(screen.getByText('Flash sale starts in')).toBeInTheDocument()
  })
})
