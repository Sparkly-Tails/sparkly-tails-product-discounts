import type { CSSProperties } from 'react'
import FlashBarView from '@/form/preview/components/FlashBarView'
import PriceRowView from '@/form/preview/components/PriceRowView'
import TierCardView from '@/form/preview/components/TierCardView'
import type { WidgetViewModel } from '@/form/preview/widgetTypes'

// The block's default look (its colour and size settings in the theme editor).
const WIDGET_STYLE = {
  '--sparkly-tier-price-font-size': '24px',
  '--sparkly-tier-moss': '#434625',
  '--sparkly-tier-cream': '#f3ecd9',
  '--sparkly-tier-sun': '#ffdc4c',
} as CSSProperties

// The storefront widget, painted from what the widget's own functions decided,
// in the markup of tier-pricing.liquid and with its stylesheet. The Mix & match
// list is not part of the preview.
export default function WidgetView({ viewModel, hasTiers, onPickQuantity }: {
  viewModel: WidgetViewModel
  hasTiers: boolean
  onPickQuantity: (quantity: number) => void
}) {
  const hasChrome = hasTiers && viewModel.showChrome
  return (
    <div className={hasChrome ? 'sparkly-tier-pricing sparkly-tier-pricing--card' : 'sparkly-tier-pricing'} style={WIDGET_STYLE} data-sparkly-tier-pricing>
      <FlashBarView bar={viewModel.flashBar} />
      <div className="sparkly-tier-pricing__body">
        <PriceRowView viewModel={viewModel} />
        <TierCardView viewModel={viewModel} onPickQuantity={onPickQuantity} />
      </div>
    </div>
  )
}
