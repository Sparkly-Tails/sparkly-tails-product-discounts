// Progress through the tiers: the state, the dot on the rail, the offer state, the screen-reader text. No DOM.
import { clamp, computeTierState, perUnitPrice, sortTiersByMinQty } from './tierMath.js'

// Progress/derived state

export function computeProgressState(tiers, otherQty, addingQty) {
  const sorted = sortTiersByMinQty(tiers)
  const topThreshold = sorted[sorted.length - 1].minQty
  const combinedQty = otherQty + addingQty
  const tierState = computeTierState(sorted, combinedQty)
  const maxed = combinedQty >= topThreshold

  // Buttons/temp-box are driven entirely by combinedQty (the true cart
  // total), not addingQty alone — the boxes always reflect what's actually
  // in the cart. A static button highlights only when combinedQty lands
  // exactly on that tier's minQty; otherwise a dashed box shows the true
  // combined quantity, positioned after whichever tier is currently
  // applied (reachedTierIndex, from tierState — the same source already
  // driving the price above). That "after" position can be the last
  // tier's own index, which puts the box to the right of it when
  // combinedQty has gone past every configured tier.
  const reachedTierIndex = sorted.findIndex((t) => t.minQty === tierState.minQty)
  const exactMatchIndex = sorted.findIndex((t) => t.minQty === combinedQty)

  const tierButtons = sorted.map((t, i) => ({ minQty: t.minQty, active: i === exactMatchIndex }))

  const tempBox = exactMatchIndex === -1 && reachedTierIndex !== -1
    ? { afterIndex: reachedTierIndex, tier: sorted[reachedTierIndex] }
    : null

  return { combinedQty, startThreshold: sorted[0].minQty, topThreshold, maxed, tierState, tierButtons, tempBox }
}

export function computeTierButtonsSignature(state, basePrice, addingQty) {
  return JSON.stringify(state.tierButtons) + '|' +
    (state.tempBox ? state.tempBox.afterIndex + ':' + state.tempBox.tier.minQty : 'none') +
    // combinedQty, not just the stepper: the temporary box shows the combined
    // quantity, which also moves when the cart changes under a still stepper.
    '|' + state.combinedQty + '|' + addingQty + '|' + basePrice
}

// Copy formatting — formatMoney is injected as an (n) => string abstraction.

export function formatTempBoxLabel(progressState, basePrice, formatMoneyFn) {
  if (!progressState.tempBox) return ''
  const qty = progressState.combinedQty
  return qty + ' × ' + formatMoneyFn(perUnitPrice(basePrice, qty, progressState.tierState))
}

export function computeOrderSummary(basePrice, addingQty, unitPrice) {
  const total = Math.round(unitPrice * addingQty * 100) / 100
  const fullPrice = Math.round(basePrice * addingQty * 100) / 100
  const savings = Math.round((fullPrice - total) * 100) / 100
  return { total, fullPrice, savings }
}

// Redesign (Stitch design) view-model pieces: pure, unused by the DOM until the
// layout PRs paint them.

// Progress bar with a dot on the current quantity. Markers sit at each tier's
// own minQty (the synthetic minQty:1 anchor is the start), evenly spaced
// whatever the value gaps. The dot is
// interpolated inside the segment it falls in; past the last tier it stays at
// the end but keeps showing the real quantity. A marker the dot sits exactly
// on is `covered` so the DOM can hide its label under the dot.
export function computeProgressDot(sortedTiers, combinedQty) {
  const values = sortedTiers.map((t) => t.minQty)
  const n = values.length
  const step = n > 1 ? 100 / (n - 1) : 0
  let dotPct = 100
  if (combinedQty <= values[0]) {
    dotPct = 0
  } else {
    for (let i = 0; i < n - 1; i++) {
      if (combinedQty <= values[i + 1]) {
        const span = values[i + 1] - values[i]
        dotPct = Math.round(clamp(i * step + ((combinedQty - values[i]) / span) * step, 0, 100))
        break
      }
    }
  }
  const markers = values.map((value, i) => {
    const pct = Math.round(i * step)
    return { value, pct, reached: combinedQty >= value, covered: pct === dotPct }
  })
  return { dotValue: combinedQty, dotPct, markers }
}

// 'progress': no discount applied yet. 'offer': a middle tier applies.
// 'highest': the top tier applies (or is passed). Discounted means the same as
// computeWidgetViewModel's price row: a fixed price or a percent off.
export function classifyOfferState(progressState) {
  const ts = progressState.tierState
  const discounted = ts.fixedPrice != null || ts.percentOff > 0
  if (!discounted) return 'progress'
  return progressState.maxed ? 'highest' : 'offer'
}

export function pluralizeUnits(qty) {
  return qty + (qty === 1 ? ' unit' : ' units')
}

// role="progressbar" values and the text a screen reader speaks for the bar.
// The value is clamped to the range; the text keeps the real quantity.
export function buildProgressSemantics(progressState) {
  const qty = progressState.combinedQty
  const min = progressState.startThreshold
  const max = progressState.topThreshold
  const state = classifyOfferState(progressState)
  const head = qty > max ? pluralizeUnits(qty) : qty + ' of ' + max + ' units'
  let tail = ''
  if (state === 'highest') {
    tail = 'Highest discount unlocked'
  } else if (state === 'offer') {
    tail = 'Offer unlocked, highest discount at ' + max
  } else {
    const ts = progressState.tierState
    const next = ts.nextTier || (ts.remainingTiers && ts.remainingTiers[0])
    if (next) tail = 'Next offer at ' + next.minQty
  }
  return { valueNow: clamp(qty, min, max), valueMin: min, valueMax: max, valueText: head + '. ' + (tail ? tail + '.' : '') }
}

// The price of the whole quantity at what the state gives each unit, in whole
// pence. An anchored tier reproduces its exact total ("8 × £13.00").
export function totalAtQuantity(basePrice, qty, state) {
  return Math.round(perUnitPrice(basePrice, qty, state) * qty * 100) / 100
}
