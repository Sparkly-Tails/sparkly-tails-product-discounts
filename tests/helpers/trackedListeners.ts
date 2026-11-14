import { vi } from 'vitest'

type AddedListener = { type: string; listener: EventListenerOrEventListenerObject | null; options?: boolean | AddEventListenerOptions }

/**
 * Notes every listener the page's scripts put on `target` (the document survives from one test to the next, so a widget
 * mounted by an earlier test would otherwise still answer a later test's events, long after its page was emptied).
 * Returns the function that takes them all off again; call it in afterEach.
 */
export function trackListeners({ target }: { target: EventTarget }): () => void {
  const addedListeners: AddedListener[] = []
  const addListener = target.addEventListener.bind(target)
  const spy = vi.spyOn(target, 'addEventListener').mockImplementation((type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) => {
    addedListeners.push({ type, listener, options })
    addListener(type, listener, options)
  })
  return function removeTrackedListeners() {
    for (const added of addedListeners) target.removeEventListener(added.type, added.listener, added.options)
    addedListeners.length = 0
    spy.mockRestore()
  }
}
