import { describe, it, expect, vi, beforeEach } from 'vitest'
import Home from '@/app/page'
import { ensureTierDiscountSafely } from '@/lib/tierDiscount'
import { getConfig } from '@/lib/config'

vi.mock('@/lib/tierDiscount', () => ({ ensureTierDiscountSafely: vi.fn() }))
vi.mock('@/lib/config', () => ({ getConfig: vi.fn() }))
vi.mock('@/lib/products', () => ({ getMemberInfo: vi.fn(async () => []) }))
vi.mock('@/timeDiscounts/config', () => ({ getTimeDiscountsConfig: vi.fn(async () => ({ discounts: [] })), computeTimeDiscountStatusLabel: vi.fn(() => '') }))
vi.mock('@/lib/shop', () => ({ getShopTimezone: vi.fn(async () => 'UTC') }))

describe('Home', () => {
  beforeEach(() => {
    vi.mocked(ensureTierDiscountSafely).mockReset()
    vi.mocked(getConfig).mockReset()
    vi.mocked(getConfig).mockResolvedValue({ discounts: [] })
  })

  it('calls ensureTierDiscountSafely before it reads anything else', async () => {
    const order: string[] = []
    vi.mocked(ensureTierDiscountSafely).mockImplementation(async () => { order.push('ensure'); return 'created' })
    vi.mocked(getConfig).mockImplementation(async () => { order.push('config'); return { discounts: [] } })

    await Home()

    expect(order).toEqual(['ensure', 'config'])
  })

  it('still renders when the tier discount could not be created', async () => {
    vi.mocked(ensureTierDiscountSafely).mockResolvedValue('failed')

    await expect(Home()).resolves.toBeTruthy()
  })
})
