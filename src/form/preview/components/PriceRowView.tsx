import type { WidgetViewModel } from '@/form/preview/widgetTypes'

function PriceTag({ tag }: { tag: WidgetViewModel['tag'] }) {
  if (!tag) return null
  return <span className="smooth-discounts__tag" data-tier-pricing-tag data-kind={tag.kind}>{tag.text}</span>
}

// The summary: the tag at the right and the promo line under it. The widget draws no price of its own: on the
// storefront the unit price is shown in the theme's own product price.
export default function PriceRowView({ viewModel }: { viewModel: WidgetViewModel }) {
  return (
    <div className="smooth-discounts__summary">
      <div className="smooth-discounts__price-row">
        <PriceTag tag={viewModel.tag} />
      </div>
      <p className="smooth-discounts__promo" data-tier-pricing-promo aria-live="polite" aria-atomic="true">{viewModel.promoLine}</p>
    </div>
  )
}
