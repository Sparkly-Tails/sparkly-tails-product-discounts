import type { PreviewTier } from '@/form/tierRows'
import type { FlashInput, buildFlashWindow, clampIndex, isFlashEnded, isFlashFilled, pickWidgetFlash, showEndedFlash } from '@/form/preview/previewModel'
import type { WidgetFunctions, WidgetViewModel } from '@/form/preview/widgetTypes'

export interface PreviewProduct {
  title: string
  price: number
  imageUrl: string | null
}

export interface PreviewTools extends Pick<WidgetFunctions, 'computeWidgetViewModel' | 'withUnitAnchor'> {
  zonedTimeToUnixSeconds: (naiveDateTime: string, timeZone: string) => number
  isFlashFilled: typeof isFlashFilled
  buildFlashWindow: typeof buildFlashWindow
  clampIndex: typeof clampIndex
  isFlashEnded: typeof isFlashEnded
  pickWidgetFlash: typeof pickWidgetFlash
  showEndedFlash: typeof showEndedFlash
}

export interface PreviewModel {
  /** True with no product: the preview asks for one. */
  isEmpty: boolean
  viewModel: WidgetViewModel | null
}

/**
 * What the storefront widget would show for the product being previewed, the
 * tiers and the flash sale in the form, with `quantity` units chosen. The
 * widget's own functions decide it; nothing is worked out here, except that a
 * sale that has ended keeps its tier card under a "Flash sale ended" bar (the
 * storefront shows only the plain price then) so the tiers can still be tried.
 */
export function buildPreviewModel({ products, selectedIndex, tiers, flash, highDemand, quantity, timeZone, nowSeconds, formatMoney, tools }: {
  products: PreviewProduct[]
  selectedIndex: number
  tiers: PreviewTier[]
  flash: FlashInput | null
  highDemand: boolean
  quantity: number
  timeZone: string
  nowSeconds: number
  /** Writes an amount the way the shop does. */
  formatMoney: (amount: number) => string
  tools: PreviewTools
}): PreviewModel {
  if (products.length === 0) return { isEmpty: true, viewModel: null }
  const product = products[tools.clampIndex({ index: selectedIndex, length: products.length })]
  const flashWindow = flash ? tools.buildFlashWindow({ flash, timeZone, tools }) : null
  const viewModel = tools.computeWidgetViewModel({
    tiers: tools.withUnitAnchor(tiers),
    basePrice: product.price,
    compareAtPrice: null,
    otherQty: 0,
    addingQty: quantity,
    isGroup: false,
    highDemand,
    flash: tools.pickWidgetFlash({ flashWindow, nowSeconds, tools }),
    nowSeconds,
    formatMoney,
  })
  return { isEmpty: false, viewModel: tools.showEndedFlash({ viewModel, flashWindow, nowSeconds, tools }) }
}
