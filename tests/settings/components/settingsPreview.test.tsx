// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import SettingsPreview from '@/settings/components/SettingsPreview'
import { stubChipLayout } from '../../helpers/chipLayout'

const NOW = 1_800_000_000
const DESIGN = { accentColor: '#112233', backgroundColor: '#445566', cornerRadius: 4, flashTone: 'deep-pine' as const }

beforeEach(() => { vi.useFakeTimers({ now: NOW * 1000 }); stubChipLayout({ chipWidth: 100, viewWidth: 400 }) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

function renderPreview() {
  return render(<SettingsPreview {...DESIGN} isFlashShown={false} onFlashShownChange={() => {}} currencyCode="USD" initialNowSeconds={NOW} />)
}

describe('SettingsPreview', () => {
  it('shows the storefront widget first, with its flash checkbox, and keeps the pop-up out of view', () => {
    renderPreview()
    expect(screen.getByRole('tab', { name: 'Storefront Widget' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Storefront Widget' })).toBeVisible()
    expect(screen.getByRole('checkbox', { name: 'Preview flash sale countdown' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Pre-checkout pop-up' })).toBeNull()
  })

  it('shows the pop-up wireframe in place of the widget when its tab is pressed, and the widget again after', () => {
    renderPreview()
    fireEvent.click(screen.getByRole('tab', { name: 'Pre-Checkout Popup' }))
    expect(screen.getByRole('tabpanel', { name: 'Pre-Checkout Popup' })).toBeVisible()
    expect(screen.getByRole('heading', { level: 2, name: 'Pre-checkout pop-up' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Preview flash sale countdown' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Storefront Widget' }))
    expect(screen.getByRole('checkbox', { name: 'Preview flash sale countdown' })).toBeInTheDocument()
  })

  it('keeps the widget\'s own choices (the product and the quantity) while the pop-up is shown', () => {
    renderPreview()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('tab', { name: 'Pre-Checkout Popup' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Storefront Widget' }))
    expect(screen.getByRole('combobox')).toHaveValue('1')
  })
})
