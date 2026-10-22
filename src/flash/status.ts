// The state of a flash sale for the admin list, the edit page and the homepage.
export type FlashStatus = 'Upcoming' | 'Active' | 'Ended'

/** `Upcoming` before the start, `Active` from the start second up to (not including) the end second, `Ended` from then on. */
export function computeFlashStatus({ startsAtMs, endsAtMs, nowMs }: { startsAtMs: number; endsAtMs: number; nowMs: number }): FlashStatus {
  if (nowMs < startsAtMs) return 'Upcoming'
  if (nowMs < endsAtMs) return 'Active'
  return 'Ended'
}
