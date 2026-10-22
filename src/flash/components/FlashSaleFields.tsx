'use client'

// The "Flash sale" part of the tier discount form: a switch, the start and end
// time in the shop's timezone, and the teaser checkbox. Laid out like the
// time-based discount's schedule fields (copied, not imported). The window
// check blocks the browser's own submit as well as showing the message.
import { useEffect, useRef, useState } from 'react'
import { SCHEDULE_CHECKS, describeScheduleProblem } from '@/flash/schedule'

const inputClass =
  'w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent'

export interface FlashFieldsInitial {
  enabled: boolean
  startsAt: string
  endsAt: string
  showTeaser: boolean
}

const EMPTY_FLASH: FlashFieldsInitial = { enabled: false, startsAt: '', endsAt: '', showTeaser: true }

function FlashWindowFields({ initial, shopTimezone, nowLocal }: { initial: FlashFieldsInitial; shopTimezone: string; nowLocal: string }) {
  const [startsAt, setStartsAt] = useState(initial.startsAt)
  const [endsAt, setEndsAt] = useState(initial.endsAt)
  const endRef = useRef<HTMLInputElement>(null)
  const problem = describeScheduleProblem({ startsAt, endsAt, nowLocal, checks: SCHEDULE_CHECKS })

  useEffect(() => {
    endRef.current?.setCustomValidity(problem ?? '')
  }, [problem])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="flashStartsAt" className="block text-sm font-medium mb-2">Starts ({shopTimezone})</label>
          <input id="flashStartsAt" name="flashStartsAt" type="datetime-local" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="flashEndsAt" className="block text-sm font-medium mb-2">Ends ({shopTimezone})</label>
          <input id="flashEndsAt" name="flashEndsAt" type="datetime-local" required ref={endRef} value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className={inputClass} />
        </div>
      </div>
      {problem && <p role="alert" className="text-xs text-danger">{problem}</p>}
      <label className="flex items-center gap-2 text-sm">
        <input name="flashShowTeaser" type="checkbox" defaultChecked={initial.showTeaser} />
        Show a teaser before the sale starts
      </label>
    </div>
  )
}

export default function FlashSaleFields({ shopTimezone, nowLocal, initial = EMPTY_FLASH }: {
  shopTimezone: string
  /** The shop's current local time (YYYY-MM-DDTHH:mm), for refusing an end that has passed. */
  nowLocal: string
  initial?: FlashFieldsInitial
}) {
  const [enabled, setEnabled] = useState(initial.enabled)

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input name="flashEnabled" type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        Run as a flash sale
      </label>
      {enabled && <FlashWindowFields initial={initial} shopTimezone={shopTimezone} nowLocal={nowLocal} />}
    </div>
  )
}
