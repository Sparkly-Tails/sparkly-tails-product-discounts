// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGroupPreview, PREVIEW_DELAY_MS } from '@/timeDiscounts/components/useGroupPreview'
import { UNREACHABLE } from '@/timeDiscounts/saveRequests'
import * as groupActions from '@/timeDiscounts/groupActions'
import type { GroupSelection } from '@/timeDiscounts/config'
import type { PreviewResult } from '@/timeDiscounts/group'

vi.mock('@/timeDiscounts/groupActions', () => ({ previewGroup: vi.fn() }))
const preview = vi.mocked(groupActions.previewGroup)

const rule = { pricingMode: 'percent' as const, amount: 20 }
const one: GroupSelection = { mode: 'products', members: [{ productId: 'gid://shopify/Product/1', title: 'Cat Toy' }] }
const two: GroupSelection = { mode: 'products', members: [{ productId: 'gid://shopify/Product/1', title: 'Cat Toy' }, { productId: 'gid://shopify/Product/2', title: 'Dog Bed' }] }
const rowsOf = (title: string) => [{ productId: 'p', title, adminUrl: 'u', regularPrice: 10, discountedPrice: 8 }]

beforeEach(() => {
  preview.mockReset()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useGroupPreview', () => {
  it('is idle without a valid rule or without any pick, and asks nothing', () => {
    expect(renderHook(() => useGroupPreview(null, one)).result.current).toEqual({ status: 'idle' })
    expect(renderHook(() => useGroupPreview(rule, { mode: 'products', members: [] })).result.current).toEqual({ status: 'idle' })
    act(() => { vi.advanceTimersByTime(5000) })
    expect(preview).not.toHaveBeenCalled()
  })

  it('shows loading, then asks once after the pause, then shows the answer', async () => {
    preview.mockResolvedValue({ ok: true, covered: rowsOf('Cat Toy') })
    const { result } = renderHook(() => useGroupPreview(rule, one, 'time_disc_1'))
    expect(result.current).toEqual({ status: 'loading' })
    expect(preview).not.toHaveBeenCalled()

    await act(async () => { await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS) })
    expect(preview).toHaveBeenCalledTimes(1)
    expect(preview).toHaveBeenCalledWith(rule, one, 'time_disc_1')
    expect(result.current).toEqual({ status: 'ok', covered: rowsOf('Cat Toy') })
  })

  it('shows the reason when the server refuses the group', async () => {
    preview.mockResolvedValue({ ok: false, error: 'Cat Toy: already in another discount' })
    const { result } = renderHook(() => useGroupPreview(rule, one))
    await act(async () => { await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS) })
    expect(result.current).toEqual({ status: 'error', error: 'Cat Toy: already in another discount' })
  })

  it('shows the reload message when the call itself is rejected', async () => {
    preview.mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useGroupPreview(rule, one))
    await act(async () => { await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS) })
    expect(result.current).toEqual({ status: 'error', error: UNREACHABLE.error })
  })

  it('waits for the changes to stop: only the last inputs are asked about', async () => {
    preview.mockResolvedValue({ ok: true, covered: rowsOf('x') })
    const { rerender } = renderHook(({ selection }) => useGroupPreview(rule, selection), { initialProps: { selection: one } })
    await act(async () => { await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS - 100) })
    rerender({ selection: two })
    await act(async () => { await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS) })
    expect(preview).toHaveBeenCalledTimes(1)
    expect(preview).toHaveBeenCalledWith(rule, two, undefined)
  })

  it('ignores an older answer that arrives after a newer question was asked', async () => {
    let answerFirst: (value: PreviewResult) => void = () => {}
    preview
      .mockImplementationOnce(() => new Promise((resolve) => { answerFirst = resolve }))
      .mockResolvedValueOnce({ ok: true, covered: rowsOf('second') })
    const { result, rerender } = renderHook(({ selection }) => useGroupPreview(rule, selection), { initialProps: { selection: one } })

    await act(async () => { await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS) }) // first question asked, not answered
    rerender({ selection: two })
    await act(async () => { await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS) }) // second asked and answered
    expect(result.current).toEqual({ status: 'ok', covered: rowsOf('second') })

    await act(async () => { answerFirst({ ok: true, covered: rowsOf('first') }) }) // the old answer finally arrives
    expect(result.current).toEqual({ status: 'ok', covered: rowsOf('second') })
  })

  it('goes back to loading when the inputs change after an answer', async () => {
    preview.mockResolvedValue({ ok: true, covered: rowsOf('x') })
    const { result, rerender } = renderHook(({ selection }) => useGroupPreview(rule, selection), { initialProps: { selection: one } })
    await act(async () => { await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS) })
    expect(result.current.status).toBe('ok')
    rerender({ selection: two })
    expect(result.current).toEqual({ status: 'loading' })
  })
})
