'use client'

import { useState } from 'react'
import Card from '@/form/components/Card'
import CheckboxField from '@/form/components/CheckboxField'
import FlashWindowFields from '@/form/components/FlashWindowFields'
import { BoltIcon } from '@/form/components/icons'

export interface FlashValues {
  enabled: boolean
  startsAt: string
  endsAt: string
  showTeaser: boolean
  highDemand: boolean
}

// The "Flash sale" card: the switch, the window and teaser while it is on, and
// the High Demand tag, which works with or without a flash sale. Every change
// is reported with all the values; the field names are the ones the actions read.
export default function FlashCard({
  shopTimezone,
  nowLocal,
  initial,
  onChange,
}: {
  shopTimezone: string
  nowLocal: string
  initial: FlashValues
  onChange?: (values: FlashValues) => void
}) {
  const [values, setValues] = useState(initial)

  function patchValues(patch: Partial<FlashValues>) {
    const next = { ...values, ...patch }
    setValues(next)
    onChange?.(next)
  }

  return (
    <Card>
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <BoltIcon className="text-[20px] text-form-secondary" />
          <h2 className="text-form-headline-sm text-form-on-surface">Flash sale</h2>
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-form-secondary-fixed text-form-on-secondary-fixed text-form-label-sm font-medium">Time-sensitive</span>
      </div>
      <div className="space-y-form-md">
        <CheckboxField name="flashEnabled" label="Run as a flash sale" isStrong checked={values.enabled} onChange={(checked) => patchValues({ enabled: checked })} />
        {values.enabled ? (
          <FlashWindowFields
            startsAt={values.startsAt}
            endsAt={values.endsAt}
            showTeaser={values.showTeaser}
            shopTimezone={shopTimezone}
            nowLocal={nowLocal}
            onPatch={patchValues}
          />
        ) : null}
        <CheckboxField name="highDemand" label="Show the High Demand tag" checked={values.highDemand} onChange={(checked) => patchValues({ highDemand: checked })} className="pt-1" />
      </div>
    </Card>
  )
}
