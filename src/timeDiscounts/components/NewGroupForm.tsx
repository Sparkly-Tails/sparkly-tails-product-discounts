'use client'

import { useActionState, useEffect, useReducer, useState } from 'react'
import { submitNewDiscount } from '@/timeDiscounts/newDiscountSubmit'
import { endTimeHasPassed, scheduleProblem, shopLocalNow } from '@/timeDiscounts/items'
import { hasUnsavedWork } from '@/timeDiscounts/rows'
import { groupSaveBlocker, isSelectionEmpty, parseRuleInput, selectionCount } from '@/timeDiscounts/group'
import type { GroupSelection } from '@/timeDiscounts/config'
import TitleScheduleFields from '@/timeDiscounts/components/TitleScheduleFields'
import GroupRuleFields from '@/timeDiscounts/components/GroupRuleFields'
import GroupPicks from '@/timeDiscounts/components/GroupPicks'
import CoveredTable from '@/timeDiscounts/components/CoveredTable'
import { useGroupPreview } from '@/timeDiscounts/components/useGroupPreview'

const NO_PICKS: GroupSelection = { mode: 'products', members: [] }

/**
 * Title, schedule, shared price and picks on one page. Nothing exists in
 * Shopify until Save is pressed on a complete form, and Save waits for the
 * server to confirm what the picks cover (a collection can only be looked up
 * there) and that the rule suits every product.
 */
export default function NewGroupForm({ shopTimezone }: { shopTimezone: string }) {
  const [state, formAction, pending] = useActionState(submitNewDiscount, null)

  const [title, setTitle] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [pricingMode, setPricingMode] = useState<'percent' | 'fixed'>('percent')
  const [amountText, setAmountText] = useState('')
  const [selection, setSelection] = useState<GroupSelection>(NO_PICKS)

  // Read the clock each time Save's state is worked out, rather than from a timer that could be stale.
  const problem = scheduleProblem(startsAt, endsAt, shopLocalNow(shopTimezone, new Date()))
  // Bumped to work Save's state out again after a submit was stopped because the end time had passed.
  const [, recheck] = useReducer((count: number) => count + 1, 0)
  const { rule, problem: ruleProblem } = parseRuleInput(pricingMode, amountText)
  const preview = useGroupPreview(rule, selection)
  const missing = groupSaveBlocker({
    title, startsAt, endsAt, scheduleProblem: problem, amountText, ruleProblem, selectionEmpty: isSelectionEmpty(selection), preview,
  })

  // The draft lives only in this page, so closing or reloading it would lose it.
  const hasWork = hasUnsavedWork({ title, startsAt, endsAt, rowCount: selectionCount(selection) + (amountText !== '' ? 1 : 0) })
  useEffect(() => {
    if (!hasWork || pending) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasWork, pending])

  const groupJson = rule ? JSON.stringify({ ...rule, selection }) : ''

  return (
    <form
      action={formAction}
      // Our own checks are authoritative: the browser must not block a Save the form has enabled (12.345 is rounded to 12.35, not refused).
      noValidate
      // The end time may have passed since Save last looked enabled: check the clock again right before submitting.
      onSubmit={(e) => {
        if (endTimeHasPassed(endsAt, shopTimezone, new Date())) {
          e.preventDefault()
          recheck()
        }
      }}
      // Enter in a text box (the title, a search) must not save the whole discount.
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') e.preventDefault()
      }}
    >
      <input type="hidden" name="kind" value="group" />
      <input type="hidden" name="group" value={groupJson} />

      <TitleScheduleFields
        title={title} startsAt={startsAt} endsAt={endsAt} problem={problem} shopTimezone={shopTimezone}
        onTitleChange={setTitle} onStartsAtChange={setStartsAt} onEndsAtChange={setEndsAt}
      />

      <GroupRuleFields
        pricingMode={pricingMode} amountText={amountText} problem={ruleProblem} disabled={pending}
        onChange={(mode, text) => { setPricingMode(mode); setAmountText(text) }}
      />

      <GroupPicks selection={selection} onChange={setSelection} disabled={pending} />

      <section className="mb-8">
        <h2 className="font-medium mb-2">Covered products</h2>
        {preview.status === 'loading' && <p className="text-sm text-muted mb-3">Checking the products…</p>}
        {preview.status === 'error' && <p role="alert" className="text-sm text-danger mb-3">{preview.error}</p>}
        {preview.status === 'ok' && <CoveredTable rows={preview.covered} emptyMessage="This selection covers no products." />}
        {preview.status === 'idle' && <p className="text-sm text-muted mb-3">Set the shared price and pick products or a collection to see what this discount covers.</p>}
      </section>

      <section>
        <button
          type="submit" disabled={missing !== null || pending}
          aria-describedby={missing ? 'save-hint' : undefined}
          className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-accent"
        >
          {pending ? 'Saving…' : 'Save discount'}
        </button>
        {missing && <p id="save-hint" className="text-xs text-muted mt-2">{missing}</p>}
        {state && !state.ok && <p role="alert" className="text-sm text-danger mt-3">{state.error}</p>}
      </section>
    </form>
  )
}
