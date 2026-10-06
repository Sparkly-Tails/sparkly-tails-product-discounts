'use client'

import { useEffect, useRef, useState } from 'react'
import ConfirmForm from '@/components/ConfirmForm'
import { useSavedToast } from '@/components/SavedToast'
import { parseRuleInput, ruleSaveDelay, sameRule, type CoveredRow } from '@/timeDiscounts/group'
import type { GroupSelection } from '@/timeDiscounts/config'
import type { Rule } from '@/timeDiscounts/rows'
import { requestGroupRuleSave, requestGroupSelectionSave } from '@/timeDiscounts/saveRequests'
import { useTitleSchedule } from '@/timeDiscounts/components/useTitleSchedule'
import { useSaveQueue } from '@/timeDiscounts/components/useSaveQueue'
import GroupRuleFields from '@/timeDiscounts/components/GroupRuleFields'
import GroupPicks from '@/timeDiscounts/components/GroupPicks'
import CoveredTable from '@/timeDiscounts/components/CoveredTable'

const inputClass =
  'w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent'

/**
 * The page of an existing group: title, schedule, shared price and picks.
 * Every part saves itself (no page-wide Save button) and shows the "Saved"
 * pill on success; a refused change is shown inline next to the part that
 * caused it. Saves are queued so only one request is in flight at a time.
 */
export default function GroupDiscountEditor({
  discountId, shopTimezone, initialTitle, initialStartsAt, initialEndsAt,
  initialPricingMode, initialAmount, initialSelection, initialCovered, deleteAction,
}: {
  discountId: string
  shopTimezone: string
  initialTitle: string
  initialStartsAt: string
  initialEndsAt: string
  initialPricingMode: 'percent' | 'fixed'
  initialAmount: number
  initialSelection: GroupSelection
  initialCovered: CoveredRow[]
  deleteAction: () => Promise<void>
}) {
  const { showSaved } = useSavedToast()
  const enqueue = useSaveQueue()
  const { title, setTitle, titleError, saveTitle, startsAt, setStartsAt, endsAt, setEndsAt, scheduleError, scheduleInvalid } =
    useTitleSchedule({ discountId, initialTitle, initialStartsAt, initialEndsAt, enqueue, showSaved })

  const [covered, setCovered] = useState(initialCovered)

  // Shared price
  const [pricingMode, setPricingMode] = useState(initialPricingMode)
  const [amountText, setAmountText] = useState(String(initialAmount))
  const [ruleError, setRuleError] = useState<string | null>(null)
  const savedRule = useRef<Rule>({ pricingMode: initialPricingMode, amount: initialAmount }) // last the server acknowledged
  const requestedRule = useRef<Rule>({ pricingMode: initialPricingMode, amount: initialAmount }) // last queued
  const { rule, problem: ruleProblem } = parseRuleInput(pricingMode, amountText)
  const ruleMode = rule?.pricingMode
  const ruleAmount = rule?.amount

  // The rule saves itself once it is valid and has settled; a changed type saves at once.
  useEffect(() => {
    if (ruleMode === undefined || ruleAmount === undefined) return
    const next: Rule = { pricingMode: ruleMode, amount: ruleAmount }
    if (sameRule(next, requestedRule.current)) return

    const timer = setTimeout(() => {
      requestedRule.current = next
      requestGroupRuleSave(enqueue, discountId, next).then((result) => {
        if (result.ok) {
          savedRule.current = next
          setRuleError(null)
          setCovered(result.covered)
          showSaved()
        } else {
          // Let the same rule be retried, unless a newer one has been queued since.
          if (sameRule(requestedRule.current, next)) requestedRule.current = savedRule.current
          setRuleError(result.error)
        }
      })
    }, ruleSaveDelay(requestedRule.current, ruleMode))
    return () => clearTimeout(timer)
  }, [ruleMode, ruleAmount, discountId, enqueue, showSaved])

  // Picks
  const [selection, setSelection] = useState(initialSelection)
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const savedSelection = useRef(initialSelection)
  const selectionRequests = useRef(0)

  function changeSelection(next: GroupSelection) {
    setSelection(next)
    setSelectionError(null)
    const mine = ++selectionRequests.current
    requestGroupSelectionSave(enqueue, discountId, next).then((result) => {
      if (result.ok) {
        savedSelection.current = next
        setCovered(result.covered)
        showSaved()
      } else if (mine === selectionRequests.current) {
        // Show what is really saved again, with the reason.
        setSelection(savedSelection.current)
        setSelectionError(result.error)
      }
    })
  }

  // Deleting rewrites the same shop config the saves do, so it waits its turn in the queue.
  async function deleteQueued() {
    await enqueue(deleteAction)
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Group discount</h1>

      <section className="mb-8">
        <label htmlFor="title" className="block text-sm font-medium mb-2">Title</label>
        <input
          id="title" type="text" value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          className={inputClass}
        />
        <p className="text-xs text-muted mt-2">Shown to customers in the countdown widget.</p>
        {titleError && <p role="alert" className="text-xs text-danger mt-1">{titleError}</p>}
      </section>

      <section className="mb-8">
        <h2 className="font-medium mb-2">Schedule</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="startsAt" className="block text-sm font-medium mb-2">Starts ({shopTimezone})</label>
            <input id="startsAt" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="endsAt" className="block text-sm font-medium mb-2">Ends ({shopTimezone})</label>
            <input id="endsAt" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputClass} />
          </div>
        </div>
        {(scheduleInvalid || scheduleError) && <p role="alert" className="text-xs text-danger mt-2">{scheduleInvalid ?? scheduleError}</p>}
      </section>

      <GroupRuleFields
        pricingMode={pricingMode} amountText={amountText} problem={ruleProblem ?? ruleError}
        onChange={(mode, text) => { setPricingMode(mode); setAmountText(text) }}
      />

      <GroupPicks selection={selection} onChange={changeSelection} excludeDiscountId={discountId} />
      {selectionError && <p role="alert" className="text-xs text-danger -mt-6 mb-8">{selectionError}</p>}

      <section className="mb-8">
        <h2 className="font-medium mb-2">Covered products</h2>
        <CoveredTable rows={covered} emptyMessage="Nothing is covered yet — pick products or a collection." />
      </section>

      <section className="flex gap-3">
        <ConfirmForm action={deleteQueued} confirmMessage="Delete this discount entirely? This cannot be undone.">
          <button type="submit" className="bg-surface border border-line hover:bg-line px-4 py-3 rounded text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger">
            Delete
          </button>
        </ConfirmForm>
      </section>
    </div>
  )
}
