import { useEffect, useRef, useState } from 'react'
import { scheduleProblem } from '@/timeDiscounts/items'
import { settledTitle, shouldSaveSchedule, titleSaveDecision } from '@/timeDiscounts/rows'
import { requestScheduleSave, requestTitleSave, type Enqueue } from '@/timeDiscounts/saveRequests'

/** How long after the last change to either date the schedule is saved. */
export const SCHEDULE_SAVE_DELAY_MS = 600

/**
 * The title (saved when its box loses focus) and the schedule (saved once
 * both dates are valid and have settled) of an existing discount. Saves are
 * queued by the caller's `enqueue`; a success calls `showSaved`.
 */
export function useTitleSchedule({
  discountId, initialTitle, initialStartsAt, initialEndsAt, enqueue, showSaved,
}: {
  discountId: string
  initialTitle: string
  initialStartsAt: string
  initialEndsAt: string
  enqueue: Enqueue
  showSaved: () => void
}) {
  const [title, setTitle] = useState(initialTitle)
  const [titleError, setTitleError] = useState<string | null>(null)
  const savedTitle = useRef(initialTitle) // last value the server acknowledged
  const requestedTitle = useRef(initialTitle) // last value a save was queued for

  const [startsAt, setStartsAt] = useState(initialStartsAt)
  const [endsAt, setEndsAt] = useState(initialEndsAt)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const savedSchedule = useRef({ startsAt: initialStartsAt, endsAt: initialEndsAt }) // last acknowledged
  const requestedSchedule = useRef({ startsAt: initialStartsAt, endsAt: initialEndsAt }) // last queued
  const scheduleInvalid = scheduleProblem(startsAt, endsAt)

  function saveTitle() {
    const decision = titleSaveDecision(title, requestedTitle.current)
    if (decision.action === 'error') {
      setTitleError(decision.message)
      return
    }
    if (decision.action === 'skip') return
    const next = decision.title
    requestedTitle.current = next
    setTitleError(null)
    requestTitleSave(enqueue, discountId, next).then((result) => {
      if (result.ok) {
        savedTitle.current = next
        if (requestedTitle.current === next) setTitleError(null) // a stale error must not sit beside a live title
        // Tidy the saved value, but never overwrite what was typed since the blur.
        setTitle((current) => settledTitle(current, next))
        showSaved()
      } else {
        // Let the same value be retried, unless a newer one has been queued since.
        if (requestedTitle.current === next) requestedTitle.current = savedTitle.current
        setTitleError(result.error)
      }
    })
  }

  // The schedule saves itself once both dates are valid and have settled.
  useEffect(() => {
    if (!shouldSaveSchedule(startsAt, endsAt, requestedSchedule.current)) return

    const timer = setTimeout(() => {
      const requested = { startsAt, endsAt }
      requestedSchedule.current = requested
      requestScheduleSave(enqueue, discountId, startsAt, endsAt).then((result) => {
        if (result.ok) {
          savedSchedule.current = requested
          setScheduleError(null)
          showSaved()
        } else {
          // Let the same dates be retried, unless newer ones have been queued since.
          if (requestedSchedule.current === requested) requestedSchedule.current = savedSchedule.current
          setScheduleError(result.error)
        }
      })
    }, SCHEDULE_SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [startsAt, endsAt, discountId, enqueue, showSaved])

  return { title, setTitle, titleError, saveTitle, startsAt, setStartsAt, endsAt, setEndsAt, scheduleError, scheduleInvalid }
}
