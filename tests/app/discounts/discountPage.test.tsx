// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { Discount } from '@/lib/config'

const config = vi.hoisted(() => ({ discounts: [] as unknown[] }))
vi.mock('@/lib/config', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/config')>()), getConfig: vi.fn(async () => config) }))
vi.mock('@/lib/products', () => ({
  getMemberInfo: vi.fn(async () => [{ productId: 'gid://shopify/Product/1', title: 'Tuna Soup', productTitle: 'Tuna Soup', price: 20, handle: 'tuna', imageUrl: null }]),
}))
vi.mock('@/lib/shop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/shop')>()),
  getShopTimezone: vi.fn(async () => 'Europe/London'),
  getShopCurrencyCode: vi.fn(async () => 'GBP'),
}))
vi.mock('@/actions/saveDiscount', () => ({ saveDiscount: vi.fn(async () => null) }))
vi.mock('@/actions/discountActions', () => ({ deleteDiscount: vi.fn(async () => {}) }))
vi.mock('@/actions/memberPickerActions', () => ({
  searchProductsAction: vi.fn(async () => []), listProductsAction: vi.fn(async () => []),
  getProductVariantsAction: vi.fn(async () => []), validateMemberAction: vi.fn(async () => ({ ok: true })),
}))
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }) }))

import DiscountPage from '../../../src/app/discounts/[discountId]/page'
import { saveDiscount } from '@/actions/saveDiscount'
import { deleteDiscount } from '@/actions/discountActions'

const baseDiscount: Discount = {
  discountId: 'disc_1', name: 'Soup', title: 'Soup Sale', status: 'live', pricingMode: 'percent',
  members: [{ productId: 'gid://shopify/Product/1' }], tiers: [{ minQty: 5, percentOff: 10 }],
}

async function renderPage(discount: Discount) {
  config.discounts = [discount]
  return render(await DiscountPage({ params: Promise.resolve({ discountId: 'disc_1' }) }))
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-11-28T12:00:00Z') }) // inside the window below
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

describe('the Edit page: the saved discount in the form', () => {
  it('shows the name as the heading and in its field, the product, the tier and no Title field', async () => {
    await renderPage(baseDiscount)
    expect(screen.getByRole('heading', { level: 1, name: 'Soup' })).toBeInTheDocument()
    expect(screen.getByLabelText('Internal name')).toHaveValue('Soup')
    expect(screen.getByRole('button', { name: 'Remove Tuna Soup' })).toBeInTheDocument()
    expect(screen.getByLabelText('Tier 1 minimum quantity')).toHaveValue(5)
    expect(screen.getByLabelText('Tier 1 percent off')).toHaveValue(10)
    expect(screen.queryByLabelText('Title')).toBeNull()
    expect(screen.queryByText('Resulting prices')).toBeNull()
  })

  it('opens a fixed-price discount in fixed mode', async () => {
    await renderPage({ ...baseDiscount, pricingMode: 'fixed', tiers: [{ minQty: 3, fixedPrice: 15 }] })
    expect(screen.getByRole('radio', { name: 'Fixed price' })).toBeChecked()
    expect(screen.getByLabelText('Tier 1 price each')).toHaveValue(15)
  })

  it('shows the flash sale switch off, with its window empty, for a discount without a flash sale', async () => {
    await renderPage(baseDiscount)
    expect(screen.getByLabelText('Run as a flash sale')).not.toBeChecked()
    expect(screen.queryByLabelText(/Starts/)).toBeNull()
  })

  it('shows the stored window and the teaser flag, in the shop time zone', async () => {
    await renderPage({ ...baseDiscount, flash: { startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', showTeaser: false } })
    expect(screen.getByLabelText('Run as a flash sale')).toBeChecked()
    expect(screen.getByLabelText('Starts (Europe/London)')).toHaveValue('2026-11-27T09:00')
    expect(screen.getByLabelText('Show a teaser before the sale starts')).not.toBeChecked()
  })

  it('shows High Demand ticked when it is set', async () => {
    await renderPage({ ...baseDiscount, highDemand: true })
    expect(screen.getByLabelText('Show the High Demand tag')).toBeChecked()
  })

  it('names the discount in the form so the save knows which one it is', async () => {
    const { container } = await renderPage(baseDiscount)
    expect(container.querySelector('input[name="discountId"]')).toHaveValue('disc_1')
  })

  it('is not found for a discount that does not exist', async () => {
    config.discounts = []
    await expect(DiscountPage({ params: Promise.resolve({ discountId: 'disc_1' }) })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})

describe('the Edit page: the badge', () => {
  const badge = () => document.querySelector('h1 + span')

  it('says Live or Draft', async () => {
    await renderPage(baseDiscount)
    expect(badge()).toHaveTextContent(/^Live$/)
    cleanup()
    await renderPage({ ...baseDiscount, status: 'draft' })
    expect(badge()).toHaveTextContent(/^Draft$/)
  })

  it('adds the state of a live flash sale: Active inside its window', async () => {
    await renderPage({ ...baseDiscount, flash: { startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', showTeaser: false } })
    expect(badge()).toHaveTextContent('Live · Flash sale: Active')
  })

  it('adds Ended after the end time and Upcoming before the start', async () => {
    await renderPage({ ...baseDiscount, flash: { startsAt: '2026-11-01T09:00', endsAt: '2026-11-02T09:00', showTeaser: true } })
    expect(badge()).toHaveTextContent('Live · Flash sale: Ended')
    cleanup()
    await renderPage({ ...baseDiscount, flash: { startsAt: '2026-12-01T09:00', endsAt: '2026-12-02T09:00', showTeaser: true } })
    expect(badge()).toHaveTextContent('Live · Flash sale: Upcoming')
  })

  it('says a draft flash sale is not running', async () => {
    await renderPage({ ...baseDiscount, status: 'draft', flash: { startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', showTeaser: true } })
    expect(badge()).toHaveTextContent('Draft · Flash sale: not running (draft)')
  })
})

describe('the Edit page: the footer', () => {
  it('has Take offline for a live discount and Go live for a draft', async () => {
    await renderPage(baseDiscount)
    expect(screen.getByRole('button', { name: 'Take offline' })).toBeInTheDocument()
    cleanup()
    await renderPage({ ...baseDiscount, status: 'draft' })
    expect(screen.getByRole('button', { name: 'Go live' })).toBeInTheDocument()
  })

  it('sends a save to the one save action', async () => {
    await renderPage(baseDiscount)
    await act(async () => { fireEvent.submit(screen.getByLabelText('Internal name').closest('form')!) })
    expect(saveDiscount).toHaveBeenCalledTimes(1)
  })

  it('deletes this discount, after asking', async () => {
    vi.useRealTimers()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await renderPage(baseDiscount)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Delete' })) })
    expect(deleteDiscount).toHaveBeenCalledTimes(1)
    expect(vi.mocked(deleteDiscount).mock.calls[0][0]).toBe('disc_1')
  })
})
