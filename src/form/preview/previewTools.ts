import { zonedTimeToUnixSeconds } from '@/lib/zonedTime'
import { buildFlashWindow, clampIndex, isFlashEnded, isFlashFilled, pickWidgetFlash, showEndedFlash } from '@/form/preview/previewModel'
import type { PreviewTools } from '@/form/preview/buildPreviewModel'
import { WIDGET_FUNCTIONS } from '@/form/preview/widgetFunctions'

export const PREVIEW_TOOLS: PreviewTools = {
  computeWidgetViewModel: WIDGET_FUNCTIONS.computeWidgetViewModel,
  withUnitAnchor: WIDGET_FUNCTIONS.withUnitAnchor,
  zonedTimeToUnixSeconds,
  isFlashFilled,
  buildFlashWindow,
  clampIndex,
  isFlashEnded,
  pickWidgetFlash,
  showEndedFlash,
}
