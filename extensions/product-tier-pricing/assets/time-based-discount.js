// extensions/product-tier-pricing/assets/time-based-discount.js
// Independent widget: no imports from or edits to tier-pricing.js. Pure math
// first, DOM last. Both scripts share one global scope, so every top-level
// name here must stay distinct from that file's (formatMoney, ...).

/**
 * startsAt/endsAt are real UTC ISO instants (with the `Z`): the metafield sync
 * converts the admin's shop-local strings with zonedTimeToUtc before writing,
 * so `new Date(...)` is the same absolute instant in every browser and the
 * countdown is right for customers in any timezone. Do NOT reintroduce naive
 * (no-offset) strings here; that was a shipped bug, fixed at the sync
 * boundary. The Function never evaluates a time window (Shopify's native
 * discount scheduling does), so this countdown can drift from the real
 * activation by ordinary network/clock latency.
 */
function computeCountdown(startsAt, endsAt, now) {
  const start = new Date(startsAt).getTime()
  const end = new Date(endsAt).getTime()
  const nowMs = now.getTime()

  if (nowMs < start || nowMs >= end) {
    return { active: false, days: 0, hours: 0, minutes: 0, seconds: 0 }
  }

  const remainingMs = end - nowMs
  const DAY_MS = 24 * 60 * 60 * 1000
  const HOUR_MS = 60 * 60 * 1000
  const MINUTE_MS = 60 * 1000

  const days = Math.floor(remainingMs / DAY_MS)
  const hours = Math.floor((remainingMs % DAY_MS) / HOUR_MS)
  const minutes = Math.floor((remainingMs % HOUR_MS) / MINUTE_MS)
  const seconds = Math.floor((remainingMs % MINUTE_MS) / 1000)

  return { active: true, days, hours, minutes, seconds }
}

function formatCountdownUnit(n) {
  return String(n).padStart(2, '0')
}

function timeDiscountNumericId(gid) {
  return String(gid).split('/').pop()
}

// Shopify money amounts here are minor units (pence/cents) — what
// variant.price and the Liquid `money` filter both use.
function computeDiscountedPriceCents(priceCents, pricingMode, amount) {
  if (pricingMode === 'fixed') return Math.round(amount * 100)
  const percent = Math.min(Math.max(amount, 0), 100)
  return Math.round((priceCents * (100 - percent)) / 100)
}

// Rows of a time-based discount for ONE product: [{ variantId: string|null,
// pricingMode, amount }]. Current metafields carry `items`; older ones carry
// one rule at the top level plus `variantIds` (null/empty = every variant).
function countdownDiscountItems(discount) {
  if (Array.isArray(discount.items)) return discount.items
  if (discount.pricingMode !== 'percent' && discount.pricingMode !== 'fixed') return []
  const rule = { pricingMode: discount.pricingMode, amount: discount.amount }
  const ids = discount.variantIds
  if (!ids || ids.length === 0) return [{ variantId: null, ...rule }]
  return ids.map((id) => ({ variantId: id, ...rule }))
}

// The variant's own row wins; otherwise the whole-product row (variantId null).
function countdownDiscountItemFor(items, variantId) {
  const own = items.find((item) => item.variantId != null && timeDiscountNumericId(item.variantId) === String(variantId))
  return own || items.find((item) => item.variantId == null) || null
}

// Whether a sale applies to this variant: it needs a row AND a genuinely lower
// price (a fixed price at or above the variant's applies no discount at
// checkout), so the widget must not advertise one.
function discountReducesPrice({ priceCents, discount, variantId }) {
  const item = countdownDiscountItemFor(countdownDiscountItems(discount), variantId)
  if (!item) return false
  return computeDiscountedPriceCents(priceCents, item.pricingMode, item.amount) < priceCents
}

// The sale price in minor units, or null when it would not be lower than the
// variant's price (a fixed price at or above it applies no discount).
function computeSalePriceCents({ priceCents, pricingMode, amount, computeDiscountedCents }) {
  const saleCents = computeDiscountedCents(priceCents, pricingMode, amount)
  return saleCents < priceCents ? saleCents : null
}

// Puts an amount in minor units into the shop's money format ("£{{amount}}").
function formatPriceCents({ cents, moneyFormat }) {
  return moneyFormat.replace(/\{\{\s*amount\s*\}\}/, (cents / 100).toFixed(2))
}

// The sale price line: hidden without a sale price, otherwise the sale price
// and the regular price as formatted text.
function buildSalePriceState({ saleCents, priceCents, moneyFormat, formatCents }) {
  if (saleCents == null) return { hidden: true, saleText: '', regularText: '' }
  return {
    hidden: false,
    saleText: formatCents({ cents: saleCents, moneyFormat }),
    regularText: formatCents({ cents: priceCents, moneyFormat }),
  }
}

// `applies` is optional: null means "no pricing data" (older metafield) and
// the widget shows the countdown alone; false hides the whole widget.
function paintCountdown({ active, days, hours, minutes, seconds, title, applies }) {
  if (!active || applies === false) {
    return { hidden: true }
  }
  return {
    hidden: false,
    label: title ? `${title} ends in:` : 'Sale ends in:',
    days: formatCountdownUnit(days),
    hours: formatCountdownUnit(hours),
    minutes: formatCountdownUnit(minutes),
    seconds: formatCountdownUnit(seconds)
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    computeCountdown,
    formatCountdownUnit,
    paintCountdown,
    computeDiscountedPriceCents,
    countdownDiscountItems,
    countdownDiscountItemFor,
    discountReducesPrice,
    timeDiscountNumericId,
    computeSalePriceCents,
    formatPriceCents,
    buildSalePriceState
  }
}

// DOM: element painting and per-widget setup

if (typeof document !== 'undefined') {
  function applyCountdownState(elements, state) {
    elements.container.hidden = state.hidden
    if (!state.hidden) {
      elements.label.textContent = state.label
      elements.days.textContent = state.days
      elements.hours.textContent = state.hours
      elements.minutes.textContent = state.minutes
      elements.seconds.textContent = state.seconds
    }
  }

  function applySalePriceState({ element, saleElement, regularElement, state }) {
    element.hidden = state.hidden
    saleElement.textContent = state.saleText
    regularElement.textContent = state.regularText
  }

  function queryWidgetElements(container) {
    return {
      container,
      price: container.querySelector('[data-time-discount-price]'),
      sale: container.querySelector('[data-time-discount-sale]'),
      regular: container.querySelector('[data-time-discount-regular]'),
      label: container.querySelector('[data-time-discount-label]'),
      days: container.querySelector('[data-time-discount-days]'),
      hours: container.querySelector('[data-time-discount-hours]'),
      minutes: container.querySelector('[data-time-discount-minutes]'),
      seconds: container.querySelector('[data-time-discount-seconds]'),
    }
  }

  function initTimeDiscountWidget() {
    document.querySelectorAll('[data-sparkly-time-discount]').forEach((container) => {
      const discount = JSON.parse(container.dataset.discount)
      if (!discount || !discount.startsAt || !discount.endsAt) return // no time discount or missing dates — leave hidden

      const elements = queryWidgetElements(container)
      const moneyFormat = container.dataset.moneyFormat ? JSON.parse(container.dataset.moneyFormat) : '{{amount}}'
      let variantId = String(discount.selectedVariantId)

      // null = no pricing data (older metafield): countdown only.
      function discountApplies() {
        const priceCents = discount.variantPrices && discount.variantPrices[variantId]
        if (countdownDiscountItems(discount).length === 0 || typeof priceCents !== 'number') return null
        return discountReducesPrice({ priceCents, discount, variantId })
      }

      // The sale price of the selected variant, in minor units, or null.
      function findSaleCents() {
        const priceCents = discount.variantPrices && discount.variantPrices[variantId]
        const item = countdownDiscountItemFor(countdownDiscountItems(discount), variantId)
        if (!item || typeof priceCents !== 'number') return null
        return computeSalePriceCents({ priceCents, pricingMode: item.pricingMode, amount: item.amount, computeDiscountedCents: computeDiscountedPriceCents })
      }

      function paintSalePrice() {
        if (!elements.price) return
        const state = buildSalePriceState({
          saleCents: findSaleCents(),
          priceCents: discount.variantPrices && discount.variantPrices[variantId],
          moneyFormat,
          formatCents: formatPriceCents,
        })
        applySalePriceState({ element: elements.price, saleElement: elements.sale, regularElement: elements.regular, state })
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
        paintSalePrice()
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTimeDiscountWidget)
  } else {
    initTimeDiscountWidget()
  }
}
