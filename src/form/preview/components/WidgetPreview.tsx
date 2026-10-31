'use client'

import { useEffect, useState } from 'react'
import PreviewFrame from '@/form/preview/components/PreviewFrame'
import QuantityPicker from '@/form/preview/components/QuantityPicker'
import WidgetView from '@/form/preview/components/WidgetView'
import { buildPreviewModel, type PreviewProduct } from '@/form/preview/buildPreviewModel'
import type { FlashInput } from '@/form/preview/previewModel'
import { PREVIEW_TOOLS } from '@/form/preview/previewTools'
import { WIDGET_FUNCTIONS } from '@/form/preview/widgetFunctions'
import { readCurrencySymbol, type PreviewTier } from '@/form/tierRows'
import type { WidgetStyle } from '@/lib/widgetStyle'

// The live preview: the storefront widget for the product chosen from the list,
// with the form's tiers and flash sale. Clicking a tier sets the quantity, as on
// the storefront, and a flash sale counts down every second. With no product it asks for one.
export default function WidgetPreview({ products, tiers, flash, highDemand, style, timeZone, currencyCode, initialNowSeconds }: {
  products: PreviewProduct[]
  tiers: PreviewTier[]
  flash: FlashInput | null
  highDemand: boolean
  /** The Design card's style, painted on the widget. */
  style: WidgetStyle
  timeZone: string
  currencyCode: string
  /** The time the page was made, so the first paint matches the server's. */
  initialNowSeconds: number
}) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [nowSeconds, setNowSeconds] = useState(initialNowSeconds)

  useEffect(() => {
    const timer = setInterval(() => setNowSeconds((seconds) => seconds + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  const moneyFormat = `${readCurrencySymbol({ currencyCode })}{{amount}}`
  const model = buildPreviewModel({
    products, selectedIndex, tiers, flash, highDemand, quantity, timeZone, nowSeconds,
    formatMoney: (amount) => WIDGET_FUNCTIONS.formatMoney(amount, moneyFormat),
    tools: PREVIEW_TOOLS,
  })
  const shownIndex = Math.min(selectedIndex, Math.max(products.length - 1, 0))

  return (
    <PreviewFrame labels={products.map((product) => product.title)} selectedIndex={shownIndex} onSelectProduct={setSelectedIndex} controls={model.viewModel ? <QuantityPicker quantity={quantity} onChange={setQuantity} /> : null}>
      {model.viewModel
        ? <WidgetView viewModel={model.viewModel} hasTiers={tiers.length > 0} widgetStyle={style} onPickQuantity={setQuantity} />
        : <p className="p-form-lg text-center text-form-body-md text-form-on-surface-variant">Add a product to see the preview</p>}
    </PreviewFrame>
  )
}
