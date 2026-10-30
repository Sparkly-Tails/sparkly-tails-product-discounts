// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import TierDiscountForm from '@/form/components/TierDiscountForm'
import type { FormValues } from '@/form/formValues'

vi.mock('@/actions/memberPickerActions', () => ({
  searchProductsAction: vi.fn(async () => []),
  listProductsAction: vi.fn(async () => []),
  getProductVariantsAction: vi.fn(async () => []),
  validateMemberAction: vi.fn(async () => ({ ok: true })),
}))

const NOW = 1_800_000_000
const SALMON = { productId: 'p1', variantId: 'v1', productTitle: 'Salmon Oil', variantTitle: '16 fl oz', price: 28, imageUrl: null }
const CHEWS = { productId: 'p2', variantId: 'v2', productTitle: 'Joint Chews', variantTitle: '90 Chews', price: 40, imageUrl: null }
const SAVED: FormValues = {
  name: 'Salmon Oil Volume Discount',
  members: [SALMON],
  pricingMode: 'percent',
  tiers: [{ minQty: 3, percentOff: 10 }],
  flash: { enabled: false, startsAt: '', endsAt: '', showTeaser: true, highDemand: false },
}
const SAVED_TIERS = { mode: 'percent' as const, percentTiers: [{ minQty: 3, percentOff: 10 }], fixedTiers: [] }
const EMPTY: FormValues = { name: '', members: [], pricingMode: 'percent', tiers: [], flash: SAVED.flash }
const EMPTY_TIERS = { mode: 'percent' as const, percentTiers: [], fixedTiers: [] }

function renderForm(overrides: Partial<Parameters<typeof TierDiscountForm>[0]> = {}) {
  const saveAction = vi.fn(async () => null)
  const view = render(
    <TierDiscountForm
      breadcrumbLabel="Edit tier discount" heading="Salmon Oil Volume Discount" badge="Draft" mode="edit"
      initial={SAVED} initialTiers={SAVED_TIERS} currencyCode="USD" shopTimezone="UTC" nowLocal="2026-10-30T12:00"
      initialNowSeconds={NOW} saveAction={saveAction} {...overrides}
    />,
  )
  return { saveAction, ...view }
}

beforeEach(() => vi.useFakeTimers({ now: NOW * 1000 }))
afterEach(() => { cleanup(); vi.useRealTimers() })

const STATUS = 'Unsaved changes on this discount tier'
const nameField = () => screen.getByLabelText('Internal name')

describe('TierDiscountForm: what it shows', () => {
  it('shows the page heading with its badge and a way back', () => {
    renderForm()
    expect(screen.getByRole('heading', { level: 1, name: 'Salmon Oil Volume Discount' })).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Discounts' })).toHaveAttribute('href', '/')
  })

  it('shows every card, filled from the saved discount, and the preview', () => {
    renderForm()
    for (const name of ['Details', 'Flash sale', 'Products & variants', 'Tiers', 'Design', 'Preview']) expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    expect(nameField()).toHaveValue('Salmon Oil Volume Discount')
    expect(screen.getByText('Salmon Oil')).toBeInTheDocument()
    expect(screen.getByLabelText('Tier 1 minimum quantity')).toHaveValue(3)
  })

  it('has no Title field', () => {
    renderForm()
    expect(screen.queryByLabelText('Title')).toBeNull()
  })
})

describe('TierDiscountForm: the footer', () => {
  it('has Discard, Go live and Save, and no status line while nothing is changed', () => {
    renderForm()
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go live' })).toHaveAttribute('name', 'goLive')
    expect(screen.getByRole('button', { name: 'Save' })).not.toHaveAttribute('name')
    expect(screen.queryByText(STATUS)).toBeNull()
  })

  it('shows "Unsaved changes" as soon as anything is changed', () => {
    renderForm()
    fireEvent.change(nameField(), { target: { value: 'Black Friday' } })
    expect(screen.getByText(STATUS)).toBeInTheDocument()
  })

  it.each([
    ['a product is removed', () => fireEvent.click(screen.getByRole('button', { name: 'Remove Salmon Oil' }))],
    ['a tier is changed', () => fireEvent.change(screen.getByLabelText('Tier 1 percent off'), { target: { value: '12' } })],
    ['High Demand is ticked', () => fireEvent.click(screen.getByRole('checkbox', { name: 'Show the High Demand tag' }))],
    ['the flash sale is switched on', () => fireEvent.click(screen.getByRole('checkbox', { name: 'Run as a flash sale' }))],
  ])('shows it when %s', (_what, change) => {
    renderForm()
    change()
    expect(screen.getByText(STATUS)).toBeInTheDocument()
  })

  it('goes away when the change is put back', () => {
    renderForm()
    fireEvent.change(nameField(), { target: { value: 'Black Friday' } })
    fireEvent.change(nameField(), { target: { value: 'Salmon Oil Volume Discount' } })
    expect(screen.queryByText(STATUS)).toBeNull()
  })

  it('cannot save or go live without a product and a complete tier', () => {
    renderForm({ initial: EMPTY, initialTiers: EMPTY_TIERS, mode: 'create' })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Go live' })).toBeDisabled()
  })

  it('can save once there is a product and a complete tier', () => {
    renderForm()
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Tier 1 percent off'), { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})

describe('TierDiscountForm: Discard', () => {
  it('on the edit page takes back every unsaved change', () => {
    renderForm()
    fireEvent.change(nameField(), { target: { value: 'Black Friday' } })
    fireEvent.change(screen.getByLabelText('Tier 1 percent off'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Remove Salmon Oil' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Run as a flash sale' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(nameField()).toHaveValue('Salmon Oil Volume Discount')
    expect(screen.getByLabelText('Tier 1 percent off')).toHaveValue(10)
    expect(screen.getByText('Salmon Oil')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Run as a flash sale' })).not.toBeChecked()
    expect(screen.queryByText(STATUS)).toBeNull()
  })

  it('on the create page is a link back to the discounts', () => {
    renderForm({ mode: 'create', initial: EMPTY, initialTiers: EMPTY_TIERS })
    expect(screen.getByRole('link', { name: 'Discard' })).toHaveAttribute('href', '/')
  })
})

describe('TierDiscountForm: the preview follows the form', () => {
  const price = () => document.querySelector('[data-tier-pricing-price]')

  it('shows the widget for the chosen product, or asks for one', () => {
    renderForm()
    expect(price()).toHaveTextContent('$28.00')
    cleanup()
    renderForm({ mode: 'create', initial: EMPTY, initialTiers: EMPTY_TIERS })
    expect(screen.getByText('Add a product to see the preview')).toBeInTheDocument()
  })

  it('does not change with the name', () => {
    renderForm()
    const before = document.querySelector('[data-sparkly-tier-pricing]')!.innerHTML
    fireEvent.change(nameField(), { target: { value: 'Black Friday' } })
    expect(document.querySelector('[data-sparkly-tier-pricing]')!.innerHTML).toBe(before)
  })

  it('changes with the tiers', () => {
    renderForm()
    expect(screen.getByRole('button', { name: '3 × $75.60' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Tier 1 percent off'), { target: { value: '20' } })
    expect(screen.getByRole('button', { name: '3 × $67.20' })).toBeInTheDocument()
  })

  it('changes with the flash sale dates', () => {
    renderForm()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Run as a flash sale' }))
    fireEvent.change(screen.getByLabelText('Starts (UTC)'), { target: { value: '2030-01-01T09:00' } })
    fireEvent.change(screen.getByLabelText('Ends (UTC)'), { target: { value: '2030-01-02T09:00' } })
    expect(screen.getByText('Flash sale starts in')).toBeInTheDocument()
  })

  it('shows the High Demand tag when it is ticked, with or without a flash sale', () => {
    renderForm()
    expect(document.querySelector('[data-tier-pricing-tag]')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show the High Demand tag' }))
    expect(document.querySelector('[data-tier-pricing-tag]')).toHaveTextContent('High Demand')
  })

  it('lets only a percentage be chosen when the products have different prices', () => {
    renderForm({ initial: { ...SAVED, members: [SALMON, CHEWS] } })
    expect(screen.getByRole('radio', { name: 'Fixed price' })).toBeDisabled()
  })
})

describe('TierDiscountForm: saving', () => {
  it('sends the name, the products, the mode and the tiers to the save action', async () => {
    const { saveAction } = renderForm()
    await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!) })
    expect(saveAction).toHaveBeenCalledTimes(1)
    const formData = (saveAction.mock.calls[0] as unknown as [unknown, FormData])[1]
    expect(formData.get('name')).toBe('Salmon Oil Volume Discount')
    expect(formData.get('member-0-productId')).toBe('p1')
    expect(formData.get('member-0-variantId')).toBe('v1')
    expect(formData.get('pricingMode')).toBe('percent')
    expect(formData.get('tier-0-minQty')).toBe('3')
    expect(formData.get('tier-0-percentOff')).toBe('10')
  })

  it('shows why a save was refused and keeps everything that was typed', async () => {
    renderForm({ saveAction: vi.fn(async () => ({ error: 'Shopify allows only 25 active discounts.' })) })
    fireEvent.change(nameField(), { target: { value: 'Black Friday' } })
    fireEvent.change(screen.getByLabelText('Tier 1 percent off'), { target: { value: '12' } })
    await act(async () => { fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!) })
    expect(screen.getByRole('alert')).toHaveTextContent('Shopify allows only 25 active discounts.')
    expect(nameField()).toHaveValue('Black Friday')
    expect(screen.getByLabelText('Tier 1 percent off')).toHaveValue(12)
  })
})
