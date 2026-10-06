// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSaveQueue } from '@/timeDiscounts/components/useSaveQueue'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('useSaveQueue', () => {
  it('starts the next save only after the previous one has finished', async () => {
    const { result } = renderHook(() => useSaveQueue())
    const first = deferred<string>()
    const events: string[] = []

    const a = result.current(() => { events.push('start a'); return first.promise })
    const b = result.current(async () => { events.push('start b'); return 'b' })

    await Promise.resolve()
    expect(events).toEqual(['start a'])

    first.resolve('a')
    expect(await a).toBe('a')
    expect(await b).toBe('b')
    expect(events).toEqual(['start a', 'start b'])
  })

  it('runs saves in the order they were requested', async () => {
    const { result } = renderHook(() => useSaveQueue())
    const order: number[] = []
    await Promise.all([1, 2, 3].map((n) => result.current(async () => { order.push(n) })))
    expect(order).toEqual([1, 2, 3])
  })

  it('does not let a failed save block the ones behind it, and still reports the failure to its caller', async () => {
    const { result } = renderHook(() => useSaveQueue())
    const failing = result.current(async () => { throw new Error('boom') })
    const next = result.current(async () => 'ok')

    await expect(failing).rejects.toThrow('boom')
    expect(await next).toBe('ok')
  })
})
