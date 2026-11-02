import type { CSSProperties } from 'react'
import FlashBarView from '@/form/preview/components/FlashBarView'
import PriceRowView from '@/form/preview/components/PriceRowView'
import TierCardView from '@/form/preview/components/TierCardView'
import { buildWidgetStyleVars } from '@/form/preview/previewModel'
import type { WidgetViewModel } from '@/form/preview/widgetTypes'
import type { WidgetStyle } from '@/lib/widgetStyle'

// The storefront widget, painted from what the widget's own functions decided,
// in the markup of tier-pricing.liquid and with its stylesheet. The Mix & match
// list is not part of the preview. The container deliberately does not carry the
// data-smooth-discounts marker: the widget script, which the admin imports for
// its functions, starts itself on every element with that marker (see
// tests/form/preview/widgetScriptIsolation.test.tsx).
export default function WidgetView({ viewModel, hasTiers, widgetStyle, onPickQuantity }: {
  viewModel: WidgetViewModel
  hasTiers: boolean
  /** The discount's style: set on the widget as the same CSS variables the storefront block sets. */
  widgetStyle: WidgetStyle
  onPickQuantity: (quantity: number) => void
}) {
  const hasChrome = hasTiers && viewModel.showChrome
  return (
    <div className={hasChrome ? 'smooth-discounts smooth-discounts--card' : 'smooth-discounts'} style={buildWidgetStyleVars({ style: widgetStyle }) as CSSProperties}>
      <FlashBarView bar={viewModel.flashBar} />
      <div className="smooth-discounts__body">
        <PriceRowView viewModel={viewModel} />
        <TierCardView viewModel={viewModel} onPickQuantity={onPickQuantity} />
      </div>
    </div>
  )
}
