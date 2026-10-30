// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

vi.mock('@/home/homeFont', () => ({ homeFont: { variable: 'font-var' } }))
vi.mock('@/lib/shop', () => ({ getShopTimezone: vi.fn(async () => 'Europe/London'), getShopCurrencyCode: vi.fn(async () => 'GBP') }))
vi.mock('@/actions/saveDiscount', () => ({ saveDiscount: vi.fn(async () => ({ error: 'Shopify allows only 25 active discounts.' })) }))
vi.mock('@/actions/memberPickerActions', () => ({
  searchProductsAction: vi.fn(async () => []),
  listProductsAction: vi.fn(async () => []),
  getProductVariantsAction: vi.fn(async () => []),
  validateMemberAction: vi.fn(async () => ({ ok: true })),
}))

import NewDiscountPage from '@/app/discounts/new/page'
import { saveDiscount } from '@/actions/saveDiscount'

beforeEach(() => vi.useFakeTimers({ now: new Date('2026-11-01T10:00:00Z') }))
afterEach(() => { cleanup(); vi.useRealTimers() })

async function renderPage() {
  const page = await NewDiscountPage()
  return render(page)
}

describe('the Create page', () => {
  it('shows the new form: heading, Draft, empty fields and no Delete', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Create tier discount' })).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByLabelText('Internal name')).toHaveValue('')
    expect(screen.getByText('0 products selected')).toBeInTheDocument()
    expect(screen.getByText('Add a product to see the preview')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delete/ })).toBeNull()
  })

  it('has Discard (back to the discounts), Go live and Save, the last two off until there is something to save', async () => {
    await renderPage()
    expect(screen.getByRole('link', { name: 'Discard' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('button', { name: 'Go live' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('uses the shop time zone and currency', async () => {
    await renderPage()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Run as a flash sale' }))
    expect(screen.getByLabelText('Starts (Europe/London)')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Starts (Europe/London)'), { target: { value: '2026-10-01T09:00' } })
    fireEvent.change(screen.getByLabelText('Ends (Europe/London)'), { target: { value: '2026-10-02T09:00' } })
    expect(screen.getByRole('alert')).toHaveTextContent('The end time has already passed')
    expect(screen.getByLabelText('Tier 1 anchor price (optional)').parentElement).toHaveTextContent('£')
  })

  it('sends the form to the save action and shows what comes back without clearing the form', async () => {
    await renderPage()
    fireEvent.change(screen.getByLabelText('Internal name'), { target: { value: 'Black Friday' } })
    await act(async () => { fireEvent.submit(screen.getByLabelText('Internal name').closest('form')!) })
    expect(saveDiscount).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent('Shopify allows only 25 active discounts.')
    expect(screen.getByLabelText('Internal name')).toHaveValue('Black Friday')
  })
})
