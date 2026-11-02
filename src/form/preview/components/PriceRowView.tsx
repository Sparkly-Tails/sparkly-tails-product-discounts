import type { WidgetViewModel } from '@/form/preview/widgetTypes'

function PriceValue({ discountedPrice, plainPrice }: { discountedPrice: string | null; plainPrice: string }) {
  return (
    <span className="smooth-discounts__price" data-tier-pricing-price>
      {discountedPrice ? <><span className="smooth-discounts__sr-only">Discounted price: </span>{discountedPrice}</> : plainPrice}
    </span>
  )
}

// "each" and the struck original price follow the price once there is a discount story to tell.
function PriceExtras({ showCard, discountedPrice, plainPrice }: { showCard: boolean; discountedPrice: string | null; plainPrice: string }) {
  return (
    <>
      {showCard ? <span className="smooth-discounts__each-label" data-tier-pricing-each-label>each</span> : null}
      {discountedPrice ? <s className="smooth-discounts__struck" data-tier-pricing-struck><span className="smooth-discounts__sr-only">Original price: </span>{plainPrice}</s> : null}
    </>
  )
}

function PriceTag({ tag }: { tag: WidgetViewModel['tag'] }) {
  if (!tag) return null
  return <span className="smooth-discounts__tag" data-tier-pricing-tag data-kind={tag.kind}>{tag.text}</span>
}

// The price row: the price with its label, "each" and the struck price, the tag
// at the right, and the promo line under it.
export default function PriceRowView({ viewModel }: { viewModel: WidgetViewModel }) {
  return (
    <div className="smooth-discounts__summary">
      <div className="smooth-discounts__price-row">
        <div className="smooth-discounts__price-group">
          {viewModel.priceLabel ? <span className="smooth-discounts__now-label" data-tier-pricing-now-label>{viewModel.priceLabel}</span> : null}
          <PriceValue discountedPrice={viewModel.discountedPrice} plainPrice={viewModel.plainPrice} />
          <PriceExtras showCard={viewModel.showCard} discountedPrice={viewModel.discountedPrice} plainPrice={viewModel.plainPrice} />
        </div>
        <PriceTag tag={viewModel.tag} />
      </div>
      <p className="smooth-discounts__promo" data-tier-pricing-promo aria-live="polite" aria-atomic="true">{viewModel.promoLine}</p>
    </div>
  )
}
