'use client'

import { useEffect, useRef } from 'react'
import { SCHEDULE_CHECKS, describeScheduleProblem } from '@/flash/schedule'
import CheckboxField from '@/form/components/CheckboxField'
import DateField from '@/form/components/DateField'

// The start and end of the sale and the teaser option. A window that must not
// be saved shows its message and blocks the browser's own submit through the end field.
export default function FlashWindowFields({
  startsAt,
  endsAt,
  showTeaser,
  shopTimezone,
  nowLocal,
  onPatch,
}: {
  startsAt: string
  endsAt: string
  showTeaser: boolean
  shopTimezone: string
  /** The shop's current local time (YYYY-MM-DDTHH:mm), for refusing an end that has passed. */
  nowLocal: string
  onPatch: (patch: { startsAt?: string; endsAt?: string; showTeaser?: boolean }) => void
}) {
  const endRef = useRef<HTMLInputElement>(null)
  const problem = describeScheduleProblem({ startsAt, endsAt, nowLocal, checks: SCHEDULE_CHECKS })

  useEffect(() => {
    endRef.current?.setCustomValidity(problem ?? '')
  }, [problem])

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-form-md pt-1">
        <DateField id="flashStartsAt" label={`Starts (${shopTimezone})`} value={startsAt} onChange={(value) => onPatch({ startsAt: value })} />
        <DateField id="flashEndsAt" label={`Ends (${shopTimezone})`} value={endsAt} onChange={(value) => onPatch({ endsAt: value })} inputRef={endRef} />
      </div>
      {problem ? <p role="alert" className="text-form-body-sm text-form-error">{problem}</p> : null}
      <CheckboxField name="flashShowTeaser" label="Show a teaser before the sale starts" checked={showTeaser} onChange={(checked) => onPatch({ showTeaser: checked })} className="pt-1" />
    </>
  )
}
