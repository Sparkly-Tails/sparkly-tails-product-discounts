// extensions/product-tier-pricing/assets/time-based-discount.js
// Independent widget, no imports from or edits to tier-pricing.js. Pure
// math first, DOM last — mirrors that file's own structure without
// sharing code with it.

// Pure countdown math
//
// Theme-extension scripts share one global scope with tier-pricing.js, which
// already declares top-level formatMoney()/extractNumericId() with different
// semantics — every top-level name here must stay distinct from that file's.

/**
 * startsAt/endsAt arrive here as real UTC ISO instants (with the `Z`
 * suffix) — syncTimeDiscountMetafields converts them from the admin's
 * naive shop-local strings via zonedTimeToUtc before writing the product
 * metafield this widget reads. `new Date(...)` parses a `Z`-suffixed
 * string as the same absolute instant in every browser, regardless of the
 * customer's own timezone, which is what makes the countdown correct for
 * customers outside the shop's timezone. `now` is a real `new Date()` —
 * also an absolute instant, so the comparison is timezone-independent on
 * both sides. Do NOT reintroduce naive (no-offset) strings here — that was
 * a real, shipped bug (the countdown activated/deactivated at the wrong
 * real-world moment for any customer outside the shop's timezone) fixed
 * by converting at the metafield-sync boundary, not by anything in this
 * file. This is independent of checkout: the Function never evaluates a
 * time window itself (spec §5 — Shopify's native discount scheduling does,
 * server-side, using the UTC dates on the discount record), so this
 * client-side countdown and the actual activation moment can still drift
 * by ordinary network/clock-sync latency — the same class of imprecision
 * any client-side countdown has, not the timezone bug this comment warns
 * against reintroducing.
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

// variantIds is null/empty when the discount covers every variant of the
// product, otherwise the GIDs of the covered variants only.
function isVariantCovered(variantIds, variantId) {
  if (!variantIds || variantIds.length === 0) return true
  return variantIds.map(timeDiscountNumericId).includes(String(variantId))
}

// A sale is only shown when the variant is covered AND the discounted price
// is genuinely lower: a fixed price at or above the variant's price applies
// no discount at checkout (the Function clamps it), so the widget must not
// advertise one either.
function computePriceDisplay({ priceCents, pricingMode, amount, variantIds, variantId }) {
  if (!isVariantCovered(variantIds, variantId)) return { show: false }
  const discountedCents = computeDiscountedPriceCents(priceCents, pricingMode, amount)
  if (discountedCents >= priceCents) return { show: false }
  return { show: true, originalCents: priceCents, discountedCents }
}

function formatTimeDiscountMoney(cents, format) {
  return format.replace(/\{\{\s*amount\s*\}\}/, (cents / 100).toFixed(2))
}

// `price` is optional: null means "no price data" (older metafield) and the
// widget shows the countdown alone; { show: false } hides the whole widget.
function paintCountdown({ active, days, hours, minutes, seconds, title, price }) {
  if (!active || (price && !price.show)) {
    return { hidden: true }
  }
  return {
    hidden: false,
    label: title ? `${title} ends in:` : 'Sale ends in:',
    days: formatCountdownUnit(days),
    hours: formatCountdownUnit(hours),
    minutes: formatCountdownUnit(minutes),
    seconds: formatCountdownUnit(seconds),
    price: price || null
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    computeCountdown,
    formatCountdownUnit,
    paintCountdown,
    computeDiscountedPriceCents,
    isVariantCovered,
    computePriceDisplay,
    formatTimeDiscountMoney,
    timeDiscountNumericId
  }
}

// DOM: element painting and per-widget setup

if (typeof document !== 'undefined') {
  function applyCountdownState(elements, state) {
    elements.container.hidden = state.hidden
    if (!state.hidden) {
      elements.priceRow.hidden = !state.price
      if (state.price) {
        elements.discounted.textContent = state.price.discountedText
        elements.original.textContent = state.price.originalText
      }
      elements.label.textContent = state.label
      elements.days.textContent = state.days
      elements.hours.textContent = state.hours
      elements.minutes.textContent = state.minutes
      elements.seconds.textContent = state.seconds
    }
  }

  function queryWidgetElements(container) {
    return {
      container,
      priceRow: container.querySelector('[data-time-discount-price-row]'),
      discounted: container.querySelector('[data-time-discount-discounted]'),
      original: container.querySelector('[data-time-discount-original]'),
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
      const moneyFormat = container.dataset.moneyFormat ? JSON.parse(container.dataset.moneyFormat) : null
      let variantId = String(discount.selectedVariantId)

      // null = no price data (older metafield / missing format): countdown only.
      function currentPrice() {
        const priceCents = discount.variantPrices && discount.variantPrices[variantId]
        if (!discount.pricingMode || !moneyFormat || typeof priceCents !== 'number') return null
        const display = computePriceDisplay({
          priceCents,
          pricingMode: discount.pricingMode,
          amount: discount.amount,
          variantIds: discount.variantIds,
          variantId
        })
        if (!display.show) return { show: false }
        return {
          show: true,
          discountedText: formatTimeDiscountMoney(display.discountedCents, moneyFormat),
          originalText: formatTimeDiscountMoney(display.originalCents, moneyFormat)
        }
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
          price: currentPrice()
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTimeDiscountWidget)
  } else {
    initTimeDiscountWidget()
  }
}
