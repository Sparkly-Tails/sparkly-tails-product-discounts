// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import Home from '@/app/page'
import { ensureTierDiscountSafely } from '@/lib/tierDiscount'
import { getConfig } from '@/lib/config'
import { getTimeDiscountsConfig } from '@/timeDiscounts/config'

vi.mock('@/lib/tierDiscount', () => ({ ensureTierDiscountSafely: vi.fn() }))
vi.mock('@/lib/config', () => ({ getConfig: vi.fn() }))
vi.mock('@/timeDiscounts/config', () => ({
  getTimeDiscountsConfig: vi.fn(async () => ({ discounts: [] })),
  computeTimeDiscountStatusLabel: vi.fn(() => 'Active'),
}))
vi.mock('@/lib/shop', () => ({ getShopTimezone: vi.fn(async () => 'UTC'), getShopCurrencyCode: vi.fn(async () => 'GBP') }))
vi.mock('@/home/homeFont', () => ({ homeFont: { variable: 'inter-variable' } }))

const noSearch = Promise.resolve({})
const liveDiscount = { discountId: 'd1', name: 'Salmon Oil', title: '', status: 'live' as const, pricingMode: 'percent' as const, members: [], tiers: [{ minQty: 3, percentOff: 10 }] }
const draftDiscount = { ...liveDiscount, discountId: 'd2', name: 'Calming Chews', status: 'draft' as const }

afterEach(cleanup)

describe('Home', () => {
  beforeEach(() => {
    vi.mocked(ensureTierDiscountSafely).mockReset()
    vi.mocked(getConfig).mockReset()
    vi.mocked(getConfig).mockResolvedValue({ discounts: [] })
    vi.mocked(getTimeDiscountsConfig).mockReset()
    vi.mocked(getTimeDiscountsConfig).mockResolvedValue({ discounts: [] })
  })

  it('calls ensureTierDiscountSafely before it reads anything else', async () => {
    const order: string[] = []
    vi.mocked(ensureTierDiscountSafely).mockImplementation(async () => { order.push('ensure'); return 'created' })
    vi.mocked(getConfig).mockImplementation(async () => { order.push('config'); return { discounts: [] } })

    await Home({ searchParams: noSearch })

    expect(order).toEqual(['ensure', 'config'])
  })

  it('still renders when the tier discount could not be created', async () => {
    vi.mocked(ensureTierDiscountSafely).mockResolvedValue('failed')

    await expect(Home({ searchParams: noSearch })).resolves.toBeTruthy()
  })

  it('shows the discounts of the shop in the table, tier discounts first', async () => {
    vi.mocked(getConfig).mockResolvedValue({ discounts: [liveDiscount, draftDiscount] })
    vi.mocked(getTimeDiscountsConfig).mockResolvedValue({ discounts: [{ discountId: 'm1', shopifyDiscountId: 'g', name: 'Spring', title: 'Spring Sale', startsAt: '2026-03-01T09:00', endsAt: '2026-03-31T23:59', kind: 'perProduct', items: [] }] })

    render(await Home({ searchParams: noSearch }))

    const rows = screen.getAllByTestId('discount-row')
    expect(rows.map((row) => within(row).getAllByRole('link')[0].textContent)).toEqual(['Salmon Oil', 'Calming Chews', 'Spring Sale'])
    expect(within(rows[2]).getByRole('link')).toHaveAttribute('href', '/time-discounts/m1')
  })

  it('applies the table settings found in the address', async () => {
    vi.mocked(getConfig).mockResolvedValue({ discounts: [liveDiscount, draftDiscount] })

    render(await Home({ searchParams: Promise.resolve({ tab: 'inactive' }) }))

    expect(screen.getAllByTestId('discount-row')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Calming Chews' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^All\s*2$/ })).toBeInTheDocument()
  })

  it('shows the app version in the footer', async () => {
    const packageJson = (await import('../../package.json')).default
    render(await Home({ searchParams: noSearch }))
    expect(screen.getByText('Smooth Discounts v' + packageJson.version)).toBeInTheDocument()
  })

  it('does not hide a failure to read the discounts', async () => {
    vi.mocked(getConfig).mockRejectedValue(new Error('Shopify is down'))

    await expect(Home({ searchParams: noSearch })).rejects.toThrow('Shopify is down')
  })
})
