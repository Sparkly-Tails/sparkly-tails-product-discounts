// Small steps of the preview model, gathered in PREVIEW_TOOLS (see previewTools.ts).
import type { WidgetFlash } from '@/form/preview/widgetTypes'

/** The flash sale as typed in the form: the shop's wall-clock times. */
export interface FlashInput {
  startsAt: string
  endsAt: string
  showTeaser: boolean
}

export function isFlashFilled({ flash }: { flash: FlashInput }): boolean {
  return Boolean(flash.startsAt && flash.endsAt)
}

/** The window in Unix seconds, or null while it is unfinished or ends before it starts. */
export function buildFlashWindow({ flash, timeZone, tools }: {
  flash: FlashInput
  timeZone: string
  tools: { isFlashFilled: typeof isFlashFilled; zonedTimeToUnixSeconds: (naiveDateTime: string, timeZone: string) => number }
}): WidgetFlash | null {
  if (!tools.isFlashFilled({ flash })) return null
  const startsAtUnix = tools.zonedTimeToUnixSeconds(flash.startsAt, timeZone)
  const endsAtUnix = tools.zonedTimeToUnixSeconds(flash.endsAt, timeZone)
  return endsAtUnix > startsAtUnix ? { startsAtUnix, endsAtUnix, showTeaser: flash.showTeaser } : null
}

/** The index kept inside the list, so a product that was removed leaves another one in view. */
export function clampIndex({ index, length }: { index: number; length: number }): number {
  return Math.min(Math.max(index, 0), length - 1)
}
