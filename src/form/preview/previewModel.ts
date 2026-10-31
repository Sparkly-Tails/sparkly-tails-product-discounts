// Small steps of the preview model, gathered in PREVIEW_TOOLS (see previewTools.ts).
import type { WidgetFlash, WidgetFlashBar, WidgetViewModel } from '@/form/preview/widgetTypes'

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

/** True once the sale's end second has come (the widget counts that second as over, too). */
export function isFlashEnded({ flashWindow, nowSeconds }: { flashWindow: WidgetFlash | null; nowSeconds: number }): boolean {
  return flashWindow !== null && nowSeconds >= flashWindow.endsAtUnix
}

/** The flash sale to hand the widget: none once it has ended, because the widget would then show only the plain price. */
export function pickWidgetFlash({ flashWindow, nowSeconds, tools }: {
  flashWindow: WidgetFlash | null
  nowSeconds: number
  tools: { isFlashEnded: typeof isFlashEnded }
}): WidgetFlash | null {
  return tools.isFlashEnded({ flashWindow, nowSeconds }) ? null : flashWindow
}

export const ENDED_FLASH_BAR: WidgetFlashBar = { variant: 'ended', text: 'Flash sale ended', label: 'Flash sale ended', timerParts: [], aside: '', chip: '' }

/** The tier card of an ended sale gets the "Flash sale ended" bar, so the preview still shows the tiers and says why they are off. */
export function showEndedFlash({ viewModel, flashWindow, nowSeconds, tools }: {
  viewModel: WidgetViewModel
  flashWindow: WidgetFlash | null
  nowSeconds: number
  tools: { isFlashEnded: typeof isFlashEnded }
}): WidgetViewModel {
  return viewModel.showCard && tools.isFlashEnded({ flashWindow, nowSeconds }) ? { ...viewModel, flashBar: ENDED_FLASH_BAR } : viewModel
}

// The most units the preview's quantity picker takes.
const MAX_QUANTITY = 999

/** A whole number from 1 up to the most the picker takes. */
export function clampQuantity({ value }: { value: number }): number {
  return Math.min(Math.max(Math.floor(value), 1), MAX_QUANTITY)
}

/** The quantity typed in the picker, or null while the field is empty or not a number. */
export function readQuantity({ text, tools }: { text: string; tools: { clampQuantity: typeof clampQuantity } }): number | null {
  const value = Number(text)
  return text.trim() === '' || Number.isNaN(value) ? null : tools.clampQuantity({ value })
}
