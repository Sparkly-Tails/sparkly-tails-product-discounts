// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import Home from '@/app/page'
import { ensureTierDiscountSafely } from '@/lib/tierDiscount'
import { getConfig } from '@/lib/config'
import { ensureMetricsPixelSafely } from '@/metrics/ensurePixel'
import { loadMetrics } from '@/home/loadMetrics'

vi.mock('@/lib/tierDiscount', () => ({ ensureTierDiscountSafely: vi.fn() }))
vi.mock('@/lib/config', () => ({ getConfig: vi.fn() }))
vi.mock('@/metrics/ensurePixel', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/metrics/ensurePixel')>()), ensureMetricsPixelSafely: vi.fn(async () => 'created') }))
vi.mock('@/lib/shop', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/shop')>()), getShopTimezone: vi.fn(async () => 'UTC'), getShopCurrencyCode: vi.fn(async () => 'GBP') }))
vi.mock('@/lib/requestShop', () => ({ getRequestShop: vi.fn(async () => 'demo.myshopify.com') }))
vi.mock('@/lib/db', () => ({ getDb: vi.fn(() => ({})) }))
vi.mock('@/home/loadMetrics', () => ({ loadMetrics: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const noSearch = Promise.resolve({})
const liveDiscount = { discountId: 'd1', name: 'Salmon Oil', title: '', status: 'live' as const, pricingMode: 'percent' as const, members: [], tiers: [{ minQty: 3, percentOff: 10 }] }
const draftDiscount = { ...liveDiscount, discountId: 'd2', name: 'Calming Chews', status: 'draft' as const }

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Home', () => {
  beforeEach(() => {
    vi.mocked(ensureTierDiscountSafely).mockReset()
    vi.mocked(getConfig).mockReset()
    vi.mocked(getConfig).mockResolvedValue({ discounts: [] })
    vi.mocked(ensureMetricsPixelSafely).mockClear()
    vi.mocked(loadMetrics).mockReset()
    vi.mocked(loadMetrics).mockResolvedValue({ totals: { visitors: 40, orders: 3, averageOrderValue: 21.5, addedRevenue: 4 }, hasPermission: true })
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

  it('shows the discounts of the shop in the table, in the order stored', async () => {
    vi.mocked(getConfig).mockResolvedValue({ discounts: [liveDiscount, draftDiscount] })

    render(await Home({ searchParams: noSearch }))

    const rows = screen.getAllByTestId('discount-row')
    expect(rows.map((row) => within(row).getAllByRole('link')[0].textContent)).toEqual(['Salmon Oil', 'Calming Chews'])
  })

  it('lists a flash sale with its window and counts it as inactive until the sale is Active', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-01T10:00:00Z'))
    const flashDiscount = { ...liveDiscount, discountId: 'f1', name: 'Black Friday', flash: { startsAt: '2026-11-27T09:00', endsAt: '2026-11-30T23:59', showTeaser: true } }
    vi.mocked(getConfig).mockResolvedValue({ discounts: [flashDiscount] })

    render(await Home({ searchParams: Promise.resolve({ tab: 'inactive' }) }))

    const [row] = screen.getAllByTestId('discount-row')
    expect(within(row).getByText(/Flash sale: Nov 27, 2026 - Nov 30, 2026 \(Upcoming\)/)).toBeInTheDocument()
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

  it('does no metrics work of its own: no pixel check and no reading of orders or visitors, so the page is not held up', async () => {
    await Home({ searchParams: noSearch })

    expect(ensureMetricsPixelSafely).not.toHaveBeenCalled()
    expect(loadMetrics).not.toHaveBeenCalled()
  })

  it('shows waiting cards that are filled in later, and the date button with the range of the address', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-02T12:00:00Z'))

    render(await Home({ searchParams: Promise.resolve({ range: 'last7' }) }))

    expect(screen.getAllByTestId('stat-value').map((value) => value.textContent)).toEqual(['…', '…', '…', '…'])
    expect(screen.getByRole('button', { name: /Last 7 days/ })).toBeInTheDocument()
  })

  it('carries the range in the table links, and the table settings in the date links', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-02T12:00:00Z'))
    vi.mocked(getConfig).mockResolvedValue({ discounts: [liveDiscount, draftDiscount] })

    render(await Home({ searchParams: Promise.resolve({ range: 'last7', tab: 'inactive' }) }))

    expect(screen.getByRole('link', { name: /^Active/ }).getAttribute('href')).toBe('/?tab=active&range=last7')
    fireEvent.click(screen.getByRole('button', { name: /Last 7 days/ }))
    expect(screen.getByRole('link', { name: 'Today' }).getAttribute('href')).toBe('/?tab=inactive&range=today')
  })
})
