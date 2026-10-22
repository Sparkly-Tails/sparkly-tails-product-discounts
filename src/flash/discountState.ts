// The state of a flash sale as the admin shows it. The times are the shop's
// wall-clock text, so they are converted with the shop timezone (the converter
// and the clock reading are passed in).
import { computeFlashStatus, type FlashStatus } from '@/flash/status'

export const DISCOUNT_STATE_TOOLS = { computeStatus: computeFlashStatus }

export function computeLocalFlashStatus(options: {
  startsAt: string
  endsAt: string
  timeZone: string
  nowMs: number
  convertToUtc: (naive: string, timeZone: string) => string
  tools: typeof DISCOUNT_STATE_TOOLS
}): FlashStatus {
  const { startsAt, endsAt, timeZone, nowMs, convertToUtc, tools } = options
  return tools.computeStatus({
    startsAtMs: new Date(convertToUtc(startsAt, timeZone)).getTime(),
    endsAtMs: new Date(convertToUtc(endsAt, timeZone)).getTime(),
    nowMs,
  })
}

// A draft discount never runs, so its window state would mislead.
const LABELS: Record<string, string> = { draft: 'Flash sale: not running (draft)' }

/** The short text for the admin: the state of a live sale, "not running" for a draft, nothing without a flash sale. */
export function describeFlashState({ discountStatus, flashStatus }: { discountStatus: 'draft' | 'live'; flashStatus: FlashStatus | null }): string {
  if (flashStatus === null) return ''
  return LABELS[discountStatus] ?? `Flash sale: ${flashStatus}`
}
