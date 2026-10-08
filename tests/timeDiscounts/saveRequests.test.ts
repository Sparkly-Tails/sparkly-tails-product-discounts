import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  requestTitleSave, requestScheduleSave, requestRowSave, requestRowRemoval, requestGroupRuleSave, requestGroupSelectionSave, UNREACHABLE,
} from '@/timeDiscounts/saveRequests'
import * as actions from '@/timeDiscounts/actions'
import * as groupActions from '@/timeDiscounts/groupActions'

vi.mock('@/timeDiscounts/actions', () => ({
  saveTimeDiscountTitle: vi.fn(),
  saveTimeDiscountSchedule: vi.fn(),
  saveTimeDiscountItem: vi.fn(),
  removeTimeDiscountItem: vi.fn(),
}))

vi.mock('@/timeDiscounts/groupActions', () => ({ saveGroupRule: vi.fn(), saveGroupSelection: vi.fn() }))

const mocked = vi.mocked(actions)
/** A queue that runs each task straight away, and records how many were queued. */
const makeEnqueue = () => {
  const enqueue = vi.fn(<T,>(task: () => Promise<T>) => task())
  return enqueue as unknown as <T>(task: () => Promise<T>) => Promise<T>
}

beforeEach(() => vi.clearAllMocks())

describe('requestTitleSave', () => {
  it('queues the save for that discount and returns the server\'s result', async () => {
    mocked.saveTimeDiscountTitle.mockResolvedValue({ ok: true })
    expect(await requestTitleSave(makeEnqueue(), 'time_disc_1', 'Summer')).toEqual({ ok: true })
    expect(mocked.saveTimeDiscountTitle).toHaveBeenCalledWith('time_disc_1', 'Summer')
  })

  it('turns a rejected call into the reload message instead of throwing', async () => {
    mocked.saveTimeDiscountTitle.mockRejectedValue(new Error('network'))
    expect(await requestTitleSave(makeEnqueue(), 'time_disc_1', 'Summer')).toEqual(UNREACHABLE)
  })
})

describe('requestScheduleSave', () => {
  it('queues the dates for that discount', async () => {
    mocked.saveTimeDiscountSchedule.mockResolvedValue({ ok: true })
    expect(await requestScheduleSave(makeEnqueue(), 'time_disc_1', '2026-07-01T12:00', '2026-07-02T12:00')).toEqual({ ok: true })
    expect(mocked.saveTimeDiscountSchedule).toHaveBeenCalledWith('time_disc_1', '2026-07-01T12:00', '2026-07-02T12:00')
  })

  it('turns a rejected call into the reload message', async () => {
    mocked.saveTimeDiscountSchedule.mockRejectedValue(new Error('stale action'))
    expect(await requestScheduleSave(makeEnqueue(), 'time_disc_1', 'a', 'b')).toEqual(UNREACHABLE)
  })
})

describe('requestRowSave', () => {
  it('sends the row\'s product, variant and the new rule', async () => {
    mocked.saveTimeDiscountItem.mockResolvedValue({ ok: true })
    const row = { productId: 'gid://shopify/Product/1', variantId: 'gid://shopify/ProductVariant/10' }
    await requestRowSave(makeEnqueue(), 'time_disc_1', row, { pricingMode: 'fixed', amount: 7.5 })
    expect(mocked.saveTimeDiscountItem).toHaveBeenCalledWith('time_disc_1', { productId: row.productId, variantId: row.variantId, pricingMode: 'fixed', amount: 7.5 })
  })

  it('turns a rejected call into the reload message', async () => {
    mocked.saveTimeDiscountItem.mockRejectedValue(new Error('network'))
    expect(await requestRowSave(makeEnqueue(), 'time_disc_1', { productId: 'p' }, { pricingMode: 'percent', amount: 5 })).toEqual(UNREACHABLE)
  })
})

describe('requestRowRemoval', () => {
  it('asks for that product/variant to be removed', async () => {
    mocked.removeTimeDiscountItem.mockResolvedValue({ ok: true })
    await requestRowRemoval(makeEnqueue(), 'time_disc_1', { productId: 'gid://shopify/Product/1', variantId: undefined })
    expect(mocked.removeTimeDiscountItem).toHaveBeenCalledWith('time_disc_1', { productId: 'gid://shopify/Product/1', variantId: undefined })
  })

  it('turns a rejected call into the reload message', async () => {
    mocked.removeTimeDiscountItem.mockRejectedValue(new Error('network'))
    expect(await requestRowRemoval(makeEnqueue(), 'time_disc_1', { productId: 'p' })).toEqual(UNREACHABLE)
  })
})

describe('requestGroupRuleSave', () => {
  it('queues the new rule for that discount and returns the result', async () => {
    vi.mocked(groupActions.saveGroupRule).mockResolvedValue({ ok: true, covered: [] })
    expect(await requestGroupRuleSave(makeEnqueue(), 'time_disc_1', { pricingMode: 'fixed', amount: 7.5 })).toEqual({ ok: true, covered: [] })
    expect(groupActions.saveGroupRule).toHaveBeenCalledWith('time_disc_1', { pricingMode: 'fixed', amount: 7.5 })
  })
  it('turns a rejected call into the reload message', async () => {
    vi.mocked(groupActions.saveGroupRule).mockRejectedValue(new Error('network'))
    expect(await requestGroupRuleSave(makeEnqueue(), 'time_disc_1', { pricingMode: 'percent', amount: 5 })).toEqual(UNREACHABLE)
  })
})

describe('requestGroupSelectionSave', () => {
  const selection = { mode: 'products' as const, members: [{ productId: 'gid://shopify/Product/1', title: 'Cat Toy' }] }
  it('queues the new picks for that discount and returns the result', async () => {
    vi.mocked(groupActions.saveGroupSelection).mockResolvedValue({ ok: false, error: 'No' })
    expect(await requestGroupSelectionSave(makeEnqueue(), 'time_disc_1', selection)).toEqual({ ok: false, error: 'No' })
    expect(groupActions.saveGroupSelection).toHaveBeenCalledWith('time_disc_1', selection)
  })
  it('turns a rejected call into the reload message', async () => {
    vi.mocked(groupActions.saveGroupSelection).mockRejectedValue(new Error('stale action'))
    expect(await requestGroupSelectionSave(makeEnqueue(), 'time_disc_1', selection)).toEqual(UNREACHABLE)
  })
})
