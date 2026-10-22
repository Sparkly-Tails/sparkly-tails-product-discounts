// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { Discount } from '@/lib/config'

const config = vi.hoisted(() => ({ discounts: [] as unknown[] }))
vi.mock('@/lib/config', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/config')>()), getConfig: vi.fn(async () => config) }))
vi.mock('@/lib/products', () => ({ getMemberInfo: vi.fn(async () => []) }))
vi.mock('@/lib/shop', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/shop')>()), getShopTimezone: vi.fn(async () => 'Europe/London') }))
vi.mock('@/actions/discountActions', () => ({
  updateDiscountMembers: vi.fn(), updateDiscountTiers: vi.fn(), updateDiscountTitle: vi.fn(), setDiscountStatus: vi.fn(), deleteDiscount: vi.fn(),
  updateDiscountFlash: vi.fn(), updateDiscountHighDemand: vi.fn(),
}))
vi.mock('next/navigation', () => ({ notFound: vi.fn() }))
vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }))
vi.mock('@/components/MemberPicker', () => ({ default: () => <div /> }))
vi.mock('@/components/TierFields', () => ({ default: () => <div /> }))
vi.mock('@/components/FixedPriceTierFields', () => ({ default: () => <div /> }))
vi.mock('@/components/ConfirmForm', () => ({ default: ({ children }: { children: React.ReactNode }) => <form>{children}</form> }))

import DiscountPage from '../../../src/app/discounts/[discountId]/page'

const baseDiscount: Discount = {
  discountId: 'disc_1', name: 'Soup', title: 'Soup Sale', status: 'live', pricingMode: 'percent',
  members: [{ productId: 'gid://shopify/Product/1' }], tiers: [{ minQty: 5, percentOff: 10 }],
}

async function renderPage(discount: Discount) {
  config.discounts = [discount]
  render(await DiscountPage({ params: Promise.resolve({ discountId: 'disc_1' }) }))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-28T12:00:00Z')) // inside the window below
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('discount page', () => {
  it('shows the Flash sale form with the switch off for a discount without a flash sale, and no state text', async () => {
    await renderPage(baseDiscount)
    expect(screen.getByText('Flash sale', { selector: 'h2' })).toBeInTheDocument()
    expect(screen.getByLabelText('Run as a flash sale')).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Save flash sale' })).toBeInTheDocument()
    expect(screen.queryByTestId('flash-state')).not.toBeInTheDocument()
  })

  it('shows the stored window, the teaser flag and the state Active for a live sale inside its window', async () => {
    await renderPage({ ...baseDiscount, flash: { startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', showTeaser: false } })
    expect(screen.getByLabelText('Run as a flash sale')).toBeChecked()
    expect(screen.getByLabelText('Starts (Europe/London)')).toHaveValue('2026-11-27T09:00')
    expect(screen.getByLabelText('Show a teaser before the sale starts')).not.toBeChecked()
    expect(screen.getByTestId('flash-state')).toHaveTextContent('Flash sale: Active')
  })

  it('shows Ended after the end time and Upcoming before the start', async () => {
    await renderPage({ ...baseDiscount, flash: { startsAt: '2026-11-01T09:00', endsAt: '2026-11-02T09:00', showTeaser: true } })
    expect(screen.getByTestId('flash-state')).toHaveTextContent('Flash sale: Ended')
    cleanup()
    await renderPage({ ...baseDiscount, flash: { startsAt: '2026-12-01T09:00', endsAt: '2026-12-02T09:00', showTeaser: true } })
    expect(screen.getByTestId('flash-state')).toHaveTextContent('Flash sale: Upcoming')
  })

  it('says a draft flash sale is not running', async () => {
    await renderPage({ ...baseDiscount, status: 'draft', flash: { startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', showTeaser: true } })
    expect(screen.getByTestId('flash-state')).toHaveTextContent('Flash sale: not running (draft)')
  })

  it('shows the High Demand checkbox checked when the flag is set, with its own Save button', async () => {
    await renderPage({ ...baseDiscount, highDemand: true })
    expect(screen.getByLabelText('Show the High Demand tag')).toBeChecked()
    expect(screen.getByRole('button', { name: 'Save High Demand tag' })).toBeInTheDocument()
  })
})
