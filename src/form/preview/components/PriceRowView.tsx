import type { WidgetViewModel } from '@/form/preview/widgetTypes'

function PriceValue({ discountedPrice, plainPrice }: { discountedPrice: string | null; plainPrice: string }) {
  return (
    <span className="sparkly-tier-pricing__price sparkly-tier-pricing__original-price" data-tier-pricing-price data-original-price="true">
      {discountedPrice ? <><span className="sparkly-tier-pricing__sr-only">Discounted price: </span>{discountedPrice}</> : plainPrice}
    </span>
  )
}

// "each" and the struck original price follow the price once there is a discount story to tell.
function PriceExtras({ showCard, discountedPrice, plainPrice }: { showCard: boolean; discountedPrice: string | null; plainPrice: string }) {
  return (
    <>
      {showCard ? <span className="sparkly-tier-pricing__each-label" data-tier-pricing-each-label>each</span> : null}
      {discountedPrice ? <s className="sparkly-tier-pricing__struck" data-tier-pricing-struck><span className="sparkly-tier-pricing__sr-only">Original price: </span>{plainPrice}</s> : null}
    </>
  )
}

function PriceTag({ tag }: { tag: WidgetViewModel['tag'] }) {
  if (!tag) return null
  return <span className="sparkly-tier-pricing__tag" data-tier-pricing-tag data-kind={tag.kind}>{tag.text}</span>
}

// The price row: the price with its label, "each" and the struck price, the tag
// at the right, and the promo line under it.
export default function PriceRowView({ viewModel }: { viewModel: WidgetViewModel }) {
  return (
    <div className="sparkly-tier-pricing__summary">
      <div className="sparkly-tier-pricing__price-row">
        <div className="sparkly-tier-pricing__price-group">
          {viewModel.priceLabel ? <span className="sparkly-tier-pricing__now-label" data-tier-pricing-now-label>{viewModel.priceLabel}</span> : null}
          <PriceValue discountedPrice={viewModel.discountedPrice} plainPrice={viewModel.plainPrice} />
          <PriceExtras showCard={viewModel.showCard} discountedPrice={viewModel.discountedPrice} plainPrice={viewModel.plainPrice} />
        </div>
        <PriceTag tag={viewModel.tag} />
      </div>
      <p className="sparkly-tier-pricing__promo" data-tier-pricing-promo aria-live="polite" aria-atomic="true">{viewModel.promoLine}</p>
    </div>
  )
}
