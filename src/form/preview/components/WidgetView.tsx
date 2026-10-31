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
// data-sparkly-tier-pricing marker: the widget script, which the admin imports for
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
    <div className={hasChrome ? 'sparkly-tier-pricing sparkly-tier-pricing--card' : 'sparkly-tier-pricing'} style={buildWidgetStyleVars({ style: widgetStyle }) as CSSProperties}>
      <FlashBarView bar={viewModel.flashBar} />
      <div className="sparkly-tier-pricing__body">
        <PriceRowView viewModel={viewModel} />
        <TierCardView viewModel={viewModel} onPickQuantity={onPickQuantity} />
      </div>
    </div>
  )
}
