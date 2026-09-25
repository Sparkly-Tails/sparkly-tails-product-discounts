// extensions/product-tier-pricing/assets/time-based-discount.js
// Independent widget, no imports from or edits to tier-pricing.js. Pure
// math first, DOM last — mirrors that file's own structure without
// sharing code with it.

// Pure countdown math

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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeCountdown, formatCountdownUnit }
}

// DOM: element painting and per-widget setup

if (typeof document !== 'undefined') {
  function paintCountdown(elements, countdown, title) {
    if (!countdown.active) {
      elements.container.hidden = true
      return
    }
    elements.container.hidden = false
    elements.label.textContent = title ? `${title} ends in:` : 'Sale ends in:'
    elements.days.textContent = formatCountdownUnit(countdown.days)
    elements.hours.textContent = formatCountdownUnit(countdown.hours)
    elements.minutes.textContent = formatCountdownUnit(countdown.minutes)
    elements.seconds.textContent = formatCountdownUnit(countdown.seconds)
  }

  function queryWidgetElements(container) {
    return {
      container,
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
      if (!discount) return // no time discount configured on this product — leave hidden, no timer needed

      const elements = queryWidgetElements(container)

      function tick() {
        const countdown = computeCountdown(discount.startsAt, discount.endsAt, new Date())
        paintCountdown(elements, countdown, discount.title)
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
