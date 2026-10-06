// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { SavedToastProvider, useSavedToast, SAVED_TOAST_VISIBLE_MS, SAVED_TOAST_SLIDE_MS } from '@/components/SavedToast'

function SaveButton() {
  const { showSaved } = useSavedToast()
  return <button onClick={showSaved}>save</button>
}

function setup() {
  return render(<SavedToastProvider><SaveButton /></SavedToastProvider>)
}

const click = () => act(() => { screen.getByRole('button', { name: 'save' }).click() })
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

describe('SavedToast', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('has an empty live region and no pill until something is saved', () => {
    setup()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('appears above the top edge, then slides down to 50px', () => {
    setup()
    click()
    const pill = screen.getByText('Saved')
    expect(pill).toHaveClass('-translate-y-[120%]')
    advance(60)
    expect(pill).toHaveClass('translate-y-[50px]')
    expect(pill).not.toHaveClass('-translate-y-[120%]')
  })

  it('stays down for 4 seconds, then slides back above the top and is removed from the page', () => {
    setup()
    click()
    advance(SAVED_TOAST_VISIBLE_MS - 100)
    expect(screen.getByText('Saved')).toHaveClass('translate-y-[50px]')

    advance(100) // 4s reached: slides back up but is still mounted while it animates
    expect(screen.getByText('Saved')).toHaveClass('-translate-y-[120%]')

    advance(SAVED_TOAST_SLIDE_MS)
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('is announced politely to assistive technology, via a region that exists before the first save', () => {
    setup()
    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    click()
    expect(screen.getByRole('status')).toBe(region)
    expect(region).toContainElement(screen.getByText('Saved'))
  })

  it('restarts the 4 seconds on a second save instead of stacking another pill', () => {
    setup()
    click()
    advance(3000)
    click()
    advance(3000) // 6s after the first save, 3s after the second
    expect(screen.getAllByText('Saved')).toHaveLength(1)
    expect(screen.getByText('Saved')).toHaveClass('translate-y-[50px]')
    advance(1000 + SAVED_TOAST_SLIDE_MS)
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('comes back down if saved again while it is already sliding out', () => {
    setup()
    click()
    advance(SAVED_TOAST_VISIBLE_MS + 100) // sliding out
    click()
    advance(60)
    expect(screen.getByText('Saved')).toHaveClass('translate-y-[50px]')
  })

  it('cleans up its timers when unmounted mid-animation', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = setup()
    click()
    advance(100)
    unmount()
    expect(() => act(() => { vi.runAllTimers() })).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
