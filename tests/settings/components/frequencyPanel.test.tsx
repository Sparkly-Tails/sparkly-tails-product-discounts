// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import FrequencyPanel from '@/settings/components/FrequencyPanel'
import SettingsForm from '@/settings/components/SettingsForm'
import { flattenSettings } from '@/settings/settingsFormValues'
import { DEFAULT_SETTINGS } from '@/settings/storeSettings'
import { stubChipLayout } from '../../helpers/chipLayout'

beforeEach(() => stubChipLayout({ chipWidth: 100, viewWidth: 400 }))
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('FrequencyPanel', () => {
  it('has the heading and the two options, once per session chosen by default', () => {
    render(<FrequencyPanel frequency="session" onChange={() => {}} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Impression Frequency' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Once per shopping session' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'At every cart-to-checkout press until the tier is unlocked' })).not.toBeChecked()
  })

  it('reports the other option when it is chosen', () => {
    const onChange = vi.fn()
    render(<FrequencyPanel frequency="session" onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'At every cart-to-checkout press until the tier is unlocked' }))
    expect(onChange).toHaveBeenCalledWith('checkout')
  })
})

describe('the Settings form with the frequency panel', () => {
  it('sends the chosen frequency with the form', () => {
    const { container } = render(<SettingsForm initial={flattenSettings({ settings: DEFAULT_SETTINGS })} currencyCode="USD" initialNowSeconds={1_800_000_000} saveAction={async () => ({ ok: true, message: '' })} />)
    expect(container.querySelector('input[type="hidden"][name="frequency"]')).toHaveValue('session')
    fireEvent.click(screen.getByRole('radio', { name: 'At every cart-to-checkout press until the tier is unlocked' }))
    expect(container.querySelector('input[type="hidden"][name="frequency"]')).toHaveValue('checkout')
  })
})
