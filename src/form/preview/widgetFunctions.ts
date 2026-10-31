import * as widgetFunctions from '../../../extensions/product-tier-pricing/src/widgetFunctions.js'
import type { WidgetFunctions } from '@/form/preview/widgetTypes'

/** The widget's own functions, so the preview decides what to show exactly as the storefront does. */
export const WIDGET_FUNCTIONS = widgetFunctions as unknown as WidgetFunctions
