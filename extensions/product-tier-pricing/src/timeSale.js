// A running time-based discount in the tier widget's price row: the sale price and the moment the window opens or closes.
import { clamp, extractNumericId } from './tierMath.js'

// Rows of a time-based discount for ONE product: [{ variantId: string|null,
// pricingMode, amount }]. Current metafields carry `items`; metafields written
// before per-row pricing carry one rule at the top level (pricingMode/amount)
// plus `variantIds` (null/empty = every variant). Named with a tier prefix
// because this file shares one global scope with time-based-discount.js.
export function tierTimeDiscountItems(discount) {
  if (Array.isArray(discount.items)) return discount.items
  if (discount.pricingMode !== 'percent' && discount.pricingMode !== 'fixed') return []
  const rule = { pricingMode: discount.pricingMode, amount: discount.amount }
  const ids = discount.variantIds
  if (!ids || ids.length === 0) return [{ variantId: null, ...rule }]
  return ids.map((id) => ({ variantId: id, ...rule }))
}

// The variant's own row wins; otherwise the whole-product row (variantId null).
export function tierTimeDiscountItemFor(items, variantId) {
  const own = items.find((item) => item.variantId != null && extractNumericId(item.variantId) === String(variantId))
  return own || items.find((item) => item.variantId == null) || null
}

// Sale price (in the shop currency's major unit, like basePrice) of an active
// time-based discount for ONE variant, or null when there is no sale to show:
// the variant has no row, the discount carries no pricing data, or the price
// wouldn't actually be lower — a fixed price at or above the variant's price
// applies no discount at checkout, so nothing is advertised. Percent: that
// much off the variant's own price. Fixed: the amount IS the final price,
// whatever the variant's price is.
export function timeDiscountSalePrice({ basePrice, discount, variantId }) {
  if (!discount || !(basePrice > 0)) return null
  const item = tierTimeDiscountItemFor(tierTimeDiscountItems(discount), variantId)
  if (!item || typeof item.amount !== 'number') return null
  if (item.pricingMode !== 'percent' && item.pricingMode !== 'fixed') return null
  const sale = item.pricingMode === 'fixed' ? item.amount : basePrice * (1 - clamp(item.amount, 0, 100) / 100)
  const rounded = Math.round(sale * 100) / 100
  return rounded < basePrice ? rounded : null
}

// True from startsAt up to (not including) endsAt. A discount without both
// dates (or with unparseable ones) is never active.
export function isTimeDiscountWindowActive(discount, now) {
  if (!discount || !discount.startsAt || !discount.endsAt) return false
  const start = new Date(discount.startsAt).getTime()
  const end = new Date(discount.endsAt).getTime()
  const nowMs = now.getTime()
  return nowMs >= start && nowMs < end
}

export function parseTimeDiscount(timeDiscountJson) {
  try {
    return JSON.parse(timeDiscountJson)
  } catch {
    return null
  }
}

export function parseActiveTimeDiscount(timeDiscountJson) {
  const discount = parseTimeDiscount(timeDiscountJson)
  return isTimeDiscountWindowActive(discount, new Date()) ? discount : null
}

// While a time-based discount is running, the same price row the tier
// discounts use shows the sale price with the regular price struck beside
// it (the CSS in tier-pricing.liquid puts the sale price on the left).
export function updateTimeDiscountDisplay(container, timeDiscountJson, basePrice, variantId, formatMoneyFn) {
  const originalPrice = container.querySelector('[data-original-price]')
  const discountedPrice = container.querySelector('[data-discounted-price]')
  if (!originalPrice || !discountedPrice) return

  const discount = parseActiveTimeDiscount(timeDiscountJson)
  const salePrice = discount && timeDiscountSalePrice({ basePrice, discount, variantId })

  if (salePrice != null) {
    discountedPrice.textContent = formatMoneyFn(salePrice)
    discountedPrice.hidden = false
    originalPrice.setAttribute('data-strike', 'true')
  } else {
    discountedPrice.hidden = true
    originalPrice.removeAttribute('data-strike')
  }
}

// The price row is only repainted when the block re-renders, and a product
// with just a time discount (no tiers) renders once on load — so without
// this the sale price would stay on screen after the discount ends (and
// appear late if the page was opened before it starts) until a refresh.
// Re-render the moment the window opens or closes. Checking each second
// rather than using one long setTimeout avoids the ~24.8 day timer limit
// and survives a sleeping tab, which is re-checked when it wakes.
export function wireTimeDiscountBoundaries(container, render) {
  const json = container.dataset.timeDiscount
  const discount = json && parseTimeDiscount(json)
  if (!discount || !discount.startsAt || !discount.endsAt) return

  let wasActive = isTimeDiscountWindowActive(discount, new Date())
  function check() {
    const isActive = isTimeDiscountWindowActive(discount, new Date())
    if (isActive === wasActive) return
    wasActive = isActive
    render()
  }
  setInterval(check, 1000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
}
