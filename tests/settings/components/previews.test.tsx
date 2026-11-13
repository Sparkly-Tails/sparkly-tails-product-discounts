// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import PopupPlaceholderPreview from '@/settings/components/PopupPlaceholderPreview'
import SettingsWidgetPreview from '@/settings/components/SettingsWidgetPreview'
import { stubChipLayout } from '../../helpers/chipLayout'

const NOW = 1_800_000_000
const DESIGN = { accentColor: '#112233', backgroundColor: '#445566', cornerRadius: 4, flashTone: 'deep-pine' as const }

beforeEach(() => { vi.useFakeTimers({ now: NOW * 1000 }); stubChipLayout({ chipWidth: 100, viewWidth: 400 }) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

function renderWidget(overrides: Partial<Parameters<typeof SettingsWidgetPreview>[0]> = {}) {
  return render(<SettingsWidgetPreview {...DESIGN} isFlashShown={false} onFlashShownChange={() => {}} currencyCode="USD" initialNowSeconds={NOW} {...overrides} />)
}

describe('SettingsWidgetPreview', () => {
  it('shows the 3 mock products to preview', () => {
    renderWidget()
    const labels = screen.getAllByRole('option').map((option) => option.textContent)
    expect(labels).toEqual(['Dog harness', 'Chew toy', 'Travel bowl'])
  })

  it('paints the widget with the four design values', () => {
    const { container } = renderWidget()
    const widget = container.querySelector('.smooth-discounts') as HTMLElement
    expect(widget.style.getPropertyValue('--smooth-discounts-moss')).toBe('#112233')
    expect(widget.style.getPropertyValue('--smooth-discounts-cream')).toBe('#445566')
    expect(widget.style.getPropertyValue('--smooth-discounts-radius')).toBe('4px')
    expect(widget.style.getPropertyValue('--smooth-discounts-flash-dark')).toBe('#1B3A2D')
  })

  it('shows the flash bar only while the countdown checkbox is ticked, and reports a tick', () => {
    const onFlashShownChange = vi.fn()
    const { container, rerender } = renderWidget({ onFlashShownChange })
    expect(container.querySelector('.smooth-discounts__flash')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Preview flash sale countdown' }))
    expect(onFlashShownChange).toHaveBeenCalledWith(true)
    rerender(<SettingsWidgetPreview {...DESIGN} isFlashShown onFlashShownChange={onFlashShownChange} currencyCode="USD" initialNowSeconds={NOW} />)
    expect(container.querySelector('.smooth-discounts__flash')).not.toBeNull()
  })
})

describe('PopupPlaceholderPreview', () => {
  it('is painted with the same variables', () => {
    const { container } = render(<PopupPlaceholderPreview {...DESIGN} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.style.getPropertyValue('--smooth-discounts-moss')).toBe('#112233')
    expect(root.style.getPropertyValue('--smooth-discounts-flash-dark')).toBe('#1B3A2D')
  })

  it('has placeholder blocks only: no product text and no script', () => {
    const { container } = render(<PopupPlaceholderPreview {...DESIGN} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Pre-checkout pop-up' })).toBeInTheDocument()
    expect(container.querySelectorAll('[data-placeholder]').length).toBeGreaterThanOrEqual(8)
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).not.toMatch(/Dog harness|Chew toy|Travel bowl/)
  })
})
