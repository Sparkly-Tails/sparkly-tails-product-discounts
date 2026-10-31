// The time-based discount widget on the page: finds its markup and counts down.
import { computeCountdown, countdownDiscountItems, discountReducesPrice, paintCountdown, timeDiscountNumericId } from './timeBasedDiscount.js'

export function applyCountdownState(elements, state) {
  elements.container.hidden = state.hidden
  if (!state.hidden) {
    elements.label.textContent = state.label
    elements.days.textContent = state.days
    elements.hours.textContent = state.hours
    elements.minutes.textContent = state.minutes
    elements.seconds.textContent = state.seconds
  }
}

export function queryWidgetElements(container) {
  return {
    container,
    label: container.querySelector('[data-time-discount-label]'),
    days: container.querySelector('[data-time-discount-days]'),
    hours: container.querySelector('[data-time-discount-hours]'),
    minutes: container.querySelector('[data-time-discount-minutes]'),
    seconds: container.querySelector('[data-time-discount-seconds]'),
  }
}

export function initTimeDiscountWidget() {
  document.querySelectorAll('[data-sparkly-time-discount]').forEach((container) => {
    const discount = JSON.parse(container.dataset.discount)
    if (!discount || !discount.startsAt || !discount.endsAt) return // no time discount or missing dates — leave hidden

    const elements = queryWidgetElements(container)
    let variantId = String(discount.selectedVariantId)

    // null = no pricing data (older metafield): countdown only.
    function discountApplies() {
      const priceCents = discount.variantPrices && discount.variantPrices[variantId]
      if (countdownDiscountItems(discount).length === 0 || typeof priceCents !== 'number') return null
      return discountReducesPrice({ priceCents, discount, variantId })
    }

    function tick() {
      const countdown = computeCountdown(discount.startsAt, discount.endsAt, new Date())
      const state = paintCountdown({
        active: countdown.active,
        days: countdown.days,
        hours: countdown.hours,
        minutes: countdown.minutes,
        seconds: countdown.seconds,
        title: discount.title,
        applies: discountApplies()
      })
      applyCountdownState(elements, state)
    }

    const productVariantsEl = document.querySelector('product-variants')
    if (productVariantsEl) {
      productVariantsEl.addEventListener('VARIANT_CHANGE', (event) => {
        const variant = event.target.currentVariant
        if (!variant || variant.id == null) return
        variantId = timeDiscountNumericId(variant.id)
        if (typeof variant.price === 'number' && discount.variantPrices) {
          discount.variantPrices[variantId] = variant.price
        }
        tick()
      })
    }

    tick()
    setInterval(tick, 1000)
  })
}
