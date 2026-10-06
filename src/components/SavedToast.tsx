'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

/** How long the pill stays down, counted from the moment it is shown. */
export const SAVED_TOAST_VISIBLE_MS = 4000
/** Slide duration — must match the `duration-300` class below. */
export const SAVED_TOAST_SLIDE_MS = 300
/** A few frames after mounting, so the browser paints the pill above the top edge before it slides down. */
const ENTER_DELAY_MS = 50

type Phase = 'hidden' | 'entering' | 'visible' | 'leaving'

const SavedToastContext = createContext<{ showSaved: () => void }>({ showSaved: () => {} })

/** Call `showSaved()` after a successful save. */
export function useSavedToast() {
  return useContext(SavedToastContext)
}

/**
 * Renders the "Saved" pill once for the whole app. It slides down from above
 * the top edge to ~50px, stays for 4 seconds, slides back up above the top of
 * the window, and is then removed from the DOM. Showing it again while it is
 * visible (or leaving) restarts the 4 seconds instead of stacking a second one.
 */
export function SavedToastProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('hidden')
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])

  const showSaved = useCallback(() => {
    clearTimers()
    setPhase((current) => (current === 'visible' || current === 'leaving' ? 'visible' : 'entering'))
    timers.current.push(setTimeout(() => setPhase('visible'), ENTER_DELAY_MS))
    timers.current.push(
      setTimeout(() => {
        setPhase('leaving')
        timers.current.push(setTimeout(() => setPhase('hidden'), SAVED_TOAST_SLIDE_MS))
      }, SAVED_TOAST_VISIBLE_MS),
    )
  }, [clearTimers])

  useEffect(() => clearTimers, [clearTimers])

  const value = useMemo(() => ({ showSaved }), [showSaved])

  return (
    <SavedToastContext.Provider value={value}>
      {children}
      {/* The live region is always mounted (empty) so screen readers register it before the pill arrives. */}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center">
        {phase !== 'hidden' && (
          <div
            className={`rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-opacity ${
              phase === 'visible'
                ? 'translate-y-[50px] opacity-100'
                : '-translate-y-[120%] opacity-0 motion-reduce:translate-y-[50px]'
            }`}
          >
            Saved
          </div>
        )}
      </div>
    </SavedToastContext.Provider>
  )
}
