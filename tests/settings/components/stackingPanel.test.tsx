// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import StackingPanel from '@/settings/components/StackingPanel'
import SettingsForm from '@/settings/components/SettingsForm'
import { flattenSettings } from '@/settings/settingsFormValues'
import { DEFAULT_SETTINGS } from '@/settings/storeSettings'
import { stubChipLayout } from '../../helpers/chipLayout'

beforeEach(() => stubChipLayout({ chipWidth: 100, viewWidth: 400 }))
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const OFF = { orderDiscounts: false, shippingDiscounts: false, productDiscounts: false }

describe('StackingPanel', () => {
  it('has the heading, the three choices with their help and the note that both discounts must allow it', () => {
    render(<StackingPanel {...OFF} hasFlash={false} onChange={() => {}} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Discount Combination & Stacking' })).toBeInTheDocument()
    for (const label of ['Order discounts', 'Shipping discounts', 'Product discounts']) expect(screen.getByRole('checkbox', { name: label })).not.toBeChecked()
    expect(screen.getByText(/Free or reduced shipping/)).toBeInTheDocument()
    expect(screen.getByText(/only when both allow it/i)).toBeInTheDocument()
  })

  it('reports the field and the new value when a choice is ticked', () => {
    const onChange = vi.fn()
    render(<StackingPanel {...OFF} hasFlash={false} onChange={onChange} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Shipping discounts' }))
    expect(onChange).toHaveBeenCalledWith('shippingDiscounts', true)
  })

  it('shows product discounts ticked and locked while a flash sale exists, with the reason', () => {
    render(<StackingPanel {...OFF} hasFlash onChange={() => {}} />)
    const box = screen.getByRole('checkbox', { name: 'Product discounts' })
    expect(box).toBeChecked()
    expect(box).toBeDisabled()
    expect(screen.getByText(/flash sale exists/i)).toBeInTheDocument()
  })
})

describe('the Settings form with the stacking panel', () => {
  function renderForm({ hasFlash }: { hasFlash: boolean }) {
    return render(<SettingsForm initial={flattenSettings({ settings: DEFAULT_SETTINGS, stacking: OFF })} hasFlash={hasFlash} shop="demo.myshopify.com" clientId="abc123" currencyCode="USD" initialNowSeconds={1_800_000_000} saveAction={async () => ({ ok: true, message: '' })} />)
  }

  it('sends each choice as true or false with the form, and sends nothing for the checkboxes themselves', () => {
    const { container } = renderForm({ hasFlash: false })
    expect(container.querySelector('input[type="hidden"][name="orderDiscounts"]')).toHaveValue('false')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Order discounts' }))
    expect(container.querySelector('input[type="hidden"][name="orderDiscounts"]')).toHaveValue('true')
    expect(container.querySelectorAll('input[type="checkbox"][name="orderDiscounts"]')).toHaveLength(0)
  })

  it('turns the Save bar on when a choice changes', () => {
    renderForm({ hasFlash: false })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Order discounts' }))
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })
})
