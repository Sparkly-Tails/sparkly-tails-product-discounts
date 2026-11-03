// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor, act } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import LiveStatCards from '@/home/components/LiveStatCards'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const RANGE = { label: 'Last 30 days', today: '2026-11-02', presets: [], keep: '' }
const CARDS = [
  { label: 'Visitors', value: '40', hint: 'a' },
  { label: 'Bundle orders', value: '3', hint: 'b' },
  { label: 'AOV', value: '£21.50', hint: 'c' },
  { label: 'Added revenue', value: '£4.00', hint: 'd' },
]
const values = () => screen.getAllByTestId('stat-value').map((node) => node.textContent)
const setReadyState = (state: string) => Object.defineProperty(document, 'readyState', { configurable: true, get: () => state })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ cards: CARDS }) }))
  vi.stubGlobal('fetch', fetchMock)
  ;(window as unknown as { shopify: unknown }).shopify = { idToken: vi.fn(async () => 'session-token') }
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (document as unknown as { readyState?: string }).readyState
  delete (window as unknown as { shopify?: unknown }).shopify
})

describe('LiveStatCards', () => {
  it('shows waiting cards first, then the numbers the route gives once the page has loaded', async () => {
    setReadyState('complete')

    render(<LiveStatCards metricsUrl="/api/metrics" range={RANGE} />)

    expect(values()).toEqual(['…', '…', '…', '…'])
    await waitFor(() => expect(values()).toEqual(['40', '3', '£21.50', '£4.00']))
    expect(fetchMock).toHaveBeenCalledWith('/api/metrics', { headers: { Authorization: 'Bearer session-token' } })
  })

  it('does not ask for the numbers until the window load event, then asks once', async () => {
    setReadyState('loading')

    render(<LiveStatCards metricsUrl="/api/metrics?range=last7" range={RANGE} />)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(values()).toEqual(['…', '…', '…', '…'])
    await act(async () => { window.dispatchEvent(new Event('load')) })
    await waitFor(() => expect(values()).toEqual(['40', '3', '£21.50', '£4.00']))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/metrics?range=last7')
  })

  it('shows a dash with "Could not load" when the numbers cannot be had, and keeps the date button', async () => {
    setReadyState('complete')
    fetchMock.mockRejectedValue(new Error('offline'))

    render(<LiveStatCards metricsUrl="/api/metrics" range={RANGE} />)

    await waitFor(() => expect(values()).toEqual(['-', '-', '-', '-']))
    expect(screen.getAllByTitle('Could not load')).toHaveLength(4)
    expect(screen.getByRole('button', { name: /Last 30 days/ })).toBeInTheDocument()
  })

  it('shows "Could not load" when App Bridge is not there to give a session token', async () => {
    setReadyState('complete')
    delete (window as unknown as { shopify?: unknown }).shopify

    render(<LiveStatCards metricsUrl="/api/metrics" range={RANGE} />)

    await waitFor(() => expect(values()).toEqual(['-', '-', '-', '-']))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not ask after it has gone away before the load event', async () => {
    setReadyState('loading')

    const { unmount } = render(<LiveStatCards metricsUrl="/api/metrics" range={RANGE} />)
    unmount()
    await act(async () => { window.dispatchEvent(new Event('load')) })

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
