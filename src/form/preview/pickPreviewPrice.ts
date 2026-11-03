import type { WidgetViewModel } from '@/form/preview/widgetTypes'

export interface PreviewPriceTexts {
  plainPrice: string
  discountedPrice: string | null
  /** True when there is no product yet and the price is only there to keep the preview's height. */
  isPlaceholder: boolean
}

/** The prices the preview shows above the widget: the ones the widget decided for the chosen quantity, or the placeholder (a price of zero) with no product. */
export function pickPreviewPrice({ viewModel, placeholder }: { viewModel: Pick<WidgetViewModel, 'plainPrice' | 'discountedPrice'> | null; placeholder: string }): PreviewPriceTexts {
  return viewModel
    ? { plainPrice: viewModel.plainPrice, discountedPrice: viewModel.discountedPrice, isPlaceholder: false }
    : { plainPrice: placeholder, discountedPrice: null, isPlaceholder: true }
}
