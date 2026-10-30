import widgetScript from '../../../extensions/product-tier-pricing/assets/tier-pricing.js'
import type { WidgetFunctions } from '@/form/preview/widgetTypes'

/** The widget's own functions, so the preview decides what to show exactly as the storefront does. */
export const WIDGET_FUNCTIONS = widgetScript as unknown as WidgetFunctions
