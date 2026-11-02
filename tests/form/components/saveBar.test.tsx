// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import SaveBar from '@/form/components/SaveBar'

/** App Bridge's save bar, as far as the page uses it: show and hide by id. */
function installAppBridge() {
  const bridge = { saveBar: { show: vi.fn(), hide: vi.fn() } }
  ;(window as unknown as { shopify?: unknown }).shopify = bridge
  return bridge.saveBar
}

beforeEach(() => { delete (window as unknown as { shopify?: unknown }).shopify })
afterEach(() => { cleanup(); delete (window as unknown as { shopify?: unknown }).shopify })

const props = { id: 'discount-save-bar', isVisible: false, canSave: true, onSave: () => {}, onDiscard: () => {} }

describe('SaveBar', () => {
  it('is Shopify\'s save bar with that id, holding a primary Save and a Discard that submit nothing themselves', () => {
    const { container } = render(<SaveBar {...props} />)
    const bar = container.querySelector('ui-save-bar')
    expect(bar).toHaveAttribute('id', 'discount-save-bar')
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('variant', 'primary')
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button')
    expect(screen.getByRole('button', { name: 'Discard' })).toHaveAttribute('type', 'button')
    expect(bar).toContainElement(screen.getByRole('button', { name: 'Save' }))
    expect(bar).toContainElement(screen.getByRole('button', { name: 'Discard' }))
  })

  it('calls onSave for Save and onDiscard for Discard', () => {
    const onSave = vi.fn()
    const onDiscard = vi.fn()
    render(<SaveBar {...props} onSave={onSave} onDiscard={onDiscard} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect([onSave.mock.calls.length, onDiscard.mock.calls.length]).toEqual([1, 0])
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect([onSave.mock.calls.length, onDiscard.mock.calls.length]).toEqual([1, 1])
  })

  it('has Save switched off when the form cannot be saved', () => {
    const { rerender } = render(<SaveBar {...props} canSave={false} />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    rerender(<SaveBar {...props} canSave />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('shows the bar while there are changes, and hides it when there are none', () => {
    const saveBar = installAppBridge()
    const { rerender } = render(<SaveBar {...props} isVisible={false} />)
    expect(saveBar.show).not.toHaveBeenCalled()
    expect(saveBar.hide).toHaveBeenLastCalledWith('discount-save-bar')
    rerender(<SaveBar {...props} isVisible />)
    expect(saveBar.show).toHaveBeenLastCalledWith('discount-save-bar')
    rerender(<SaveBar {...props} isVisible={false} />)
    expect(saveBar.hide).toHaveBeenCalledTimes(2)
  })

  it('hides the bar when the page goes away, so it is not left on the next page', () => {
    const saveBar = installAppBridge()
    const { unmount } = render(<SaveBar {...props} isVisible />)
    saveBar.hide.mockClear()
    unmount()
    expect(saveBar.hide).toHaveBeenCalledWith('discount-save-bar')
  })

  it('does nothing, and does not fail, when App Bridge is not on the page', () => {
    expect(() => render(<SaveBar {...props} isVisible />)).not.toThrow()
  })
})
