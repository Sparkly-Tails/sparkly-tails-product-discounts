// The time-based discount widget's pure parts: the countdown, the discounted price, the rows of a discount. No DOM.

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
export function computeCountdown(startsAt, endsAt, now) {
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

export function formatCountdownUnit(n) {
  return String(n).padStart(2, '0')
}

export function timeDiscountNumericId(gid) {
  return String(gid).split('/').pop()
}

// Shopify money amounts here are minor units (pence/cents) — what
// variant.price and the Liquid `money` filter both use.
export function computeDiscountedPriceCents(priceCents, pricingMode, amount) {
  if (pricingMode === 'fixed') return Math.round(amount * 100)
  const percent = Math.min(Math.max(amount, 0), 100)
  return Math.round((priceCents * (100 - percent)) / 100)
}

// Rows of a time-based discount for ONE product: [{ variantId: string|null,
// pricingMode, amount }]. Current metafields carry `items`; metafields written
// before per-row pricing carry one rule at the top level (pricingMode/amount)
// plus `variantIds` (null/empty = every variant). Named with a countdown
// prefix because this file shares one global scope with tier-pricing.js.
export function countdownDiscountItems(discount) {
  if (Array.isArray(discount.items)) return discount.items
  if (discount.pricingMode !== 'percent' && discount.pricingMode !== 'fixed') return []
  const rule = { pricingMode: discount.pricingMode, amount: discount.amount }
  const ids = discount.variantIds
  if (!ids || ids.length === 0) return [{ variantId: null, ...rule }]
  return ids.map((id) => ({ variantId: id, ...rule }))
}

// The variant's own row wins; otherwise the whole-product row (variantId null).
export function countdownDiscountItemFor(items, variantId) {
  const own = items.find((item) => item.variantId != null && timeDiscountNumericId(item.variantId) === String(variantId))
  return own || items.find((item) => item.variantId == null) || null
}

// Whether a sale actually applies to this variant: it must have a row AND the
// discounted price must be genuinely lower — a fixed price at or above the
// variant's price applies no discount at checkout (the Function clamps it), so
// the widget must not advertise one. The sale price itself is shown by the
// tier-pricing price block.
export function discountReducesPrice({ priceCents, discount, variantId }) {
  const item = countdownDiscountItemFor(countdownDiscountItems(discount), variantId)
  if (!item) return false
  return computeDiscountedPriceCents(priceCents, item.pricingMode, item.amount) < priceCents
}

// `applies` is optional: null means "no pricing data" (older metafield) and
// the widget shows the countdown alone; false hides the whole widget.
export function paintCountdown({ active, days, hours, minutes, seconds, title, applies }) {
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
