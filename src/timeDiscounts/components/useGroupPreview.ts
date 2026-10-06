import { useEffect, useRef, useState } from 'react'
import { previewGroup } from '@/timeDiscounts/groupActions'
import { UNREACHABLE } from '@/timeDiscounts/saveRequests'
import { isSelectionEmpty, previewKey, type CoveredRow, type PreviewResult } from '@/timeDiscounts/group'
import type { GroupSelection } from '@/timeDiscounts/config'
import type { Rule } from '@/timeDiscounts/rows'

/** How long after the last change to the rule or the picks the server is asked. */
export const PREVIEW_DELAY_MS = 600

export type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; covered: CoveredRow[] }
  | { status: 'error'; error: string }

const IDLE: PreviewState = { status: 'idle' }
const LOADING: PreviewState = { status: 'loading' }

/**
 * Asks the server what a group would do (see `previewGroup`) once the rule and
 * the picks have stopped changing. `idle` without a valid rule or without a
 * pick; `loading` until the answer for the CURRENT inputs arrives. An answer
 * for inputs that have since changed is ignored, so a slow older reply can
 * never replace a newer one.
 */
export function useGroupPreview(rule: Rule | null, selection: GroupSelection, excludeDiscountId?: string): PreviewState {
  const [answer, setAnswer] = useState<{ key: string; result: PreviewResult } | null>(null)
  const generation = useRef(0)
  const latest = useRef({ rule, selection })
  const key = rule !== null && !isSelectionEmpty(selection) ? previewKey(rule, selection) : null

  useEffect(() => {
    latest.current = { rule, selection }
  })

  useEffect(() => {
    if (key === null) return
    const mine = generation.current
    const timer = setTimeout(() => {
      const { rule: asked, selection: picks } = latest.current
      if (asked === null) return
      previewGroup(asked, picks, excludeDiscountId).then(
        (result) => {
          if (generation.current === mine) setAnswer({ key, result })
        },
        () => {
          if (generation.current === mine) setAnswer({ key, result: { ok: false, error: UNREACHABLE.error } })
        },
      )
    }, PREVIEW_DELAY_MS)
    return () => {
      generation.current += 1
      clearTimeout(timer)
    }
  }, [key, excludeDiscountId])

  if (key === null) return IDLE
  if (answer === null || answer.key !== key) return LOADING
  return answer.result.ok ? { status: 'ok', covered: answer.result.covered } : { status: 'error', error: answer.result.error }
}
