// The words of the widget: promo line, status row, tier chips and the tag at the right of the price row. No DOM.
import { computeTierState, perUnitPrice, sortTiersByMinQty, unitPriceAtTier } from './tierMath.js'
import { classifyOfferState, pluralizeUnits, totalAtQuantity } from './progress.js'

// Joins a list the way someone would say it out loud ("A, B, or C") rather
// than dumping it with a mechanical separator — used for the promo line so
// it reads the same whether a discount has one tier or several.
export function joinNaturally(parts) {
  if (parts.length <= 1) return parts.join('')
  if (parts.length === 2) return parts[0] + ' or ' + parts[1]
  return parts.slice(0, -1).join(', ') + ', or ' + parts[parts.length - 1]
}

// The line under the price before any offer applies: "Mix and match 8+ for
// £1.63 or 16+ for £1.55" (group) / "Buy 8+ for …" (standalone).
export function buildPromoLine(tiers, basePrice, formatMoneyFn, isGroup) {
  const clauses = sortTiersByMinQty(tiers).slice(1).map((t) => t.minQty + '+ for ' + formatMoneyFn(unitPriceAtTier(basePrice, t)))
  if (clauses.length === 0) return ''
  return (isGroup ? 'Mix and match ' : 'Buy ') + joinNaturally(clauses)
}

// Status row copy per state: what the customer has (the quantity in bold) on
// the left, and the hint on the right. No headline replaces the promo line any
// more: the promo line stays in every state (the design keeps it).
//   progress: "You have 5 units" / "Add 3 for £1.63/ea" (accent colour)
//   offer:    "You have 10 units" / "Add 6 for £1.55/ea" (olive)
//   highest:  "You have 16 units" / "Best Rate (£1.55/ea • Add any qty)" (success green, a check drawn before it);
//             beyond the top tier the sentence adds " (Exceeds 16+ tier)".
export function buildStatusCopy({ progressState, tiers, basePrice, formatMoney: formatMoneyFn }) {
  const state = classifyOfferState(progressState)
  const sorted = sortTiersByMinQty(tiers)
  const qty = progressState.combinedQty
  const ts = progressState.tierState
  const unit = perUnitPrice(basePrice, qty, ts)
  const nextRaw = ts.nextTier || (ts.remainingTiers && ts.remainingTiers[0])
  // The state's nextTier only carries minQty/percentOff/fixedPrice; price the
  // configured tier itself so an anchor tier is priced right.
  const next = nextRaw ? sorted.find((t) => t.minQty === nextRaw.minQty) : null
  const nextHint = next ? 'Add ' + nextRaw.delta + ' for ' + formatMoneyFn(unitPriceAtTier(basePrice, next)) + '/ea' : null
  const beyondTop = state === 'highest' && qty > progressState.topThreshold
  const after = beyondTop ? ' (Exceeds ' + progressState.topThreshold + '+ tier)' : ''
  const strong = pluralizeUnits(qty)
  const hint = {
    progress: { hintText: nextHint, hintTone: 'accent' },
    offer: { hintText: nextHint, hintTone: 'olive' },
    highest: { hintText: 'Best Rate (' + formatMoneyFn(unit) + '/ea • Add any qty)', hintTone: 'success' },
  }[state]
  return {
    state,
    statusText: 'You have ' + strong + after,
    statusParts: { before: 'You have ', strong, after },
    hintText: hint.hintText,
    hintTone: hint.hintTone,
  }
}

// The hidden "1 × full price" start tier that withUnitAnchor adds: no discount of any kind.
export function isUnitAnchorTier(tier) {
  return tier.minQty === 1 && !(tier.percentOff > 0) && tier.fixedPrice == null && tier.anchorPrice == null
}

// The chips of the design: "8 × £13.00" per tier (the exact total for that
// quantity), the applied tier ticked, and a dashed chip for the current
// quantity when it falls between tiers (a star past the top tier). `tone`:
//   tier chips: 'idle', 'applied' (the tier that gives the price now) or
//   'exact' (the quantity is exactly this tier and no offer applies yet);
//   current chip: the offer state ('progress', 'offer' or 'highest').
export function buildTierChips({ tiers, basePrice, combinedQty, formatMoney: formatMoneyFn }) {
  const sorted = sortTiersByMinQty(tiers)
  const state = computeTierState(sorted, combinedQty)
  const discounted = state.fixedPrice != null || state.percentOff > 0
  const appliedMinQty = discounted ? state.minQty : null
  const topMinQty = sorted[sorted.length - 1].minQty
  const currentTone = !discounted ? 'progress' : combinedQty >= topMinQty ? 'highest' : 'offer'
  const onTier = sorted.some((tier) => tier.minQty === combinedQty)
  const chips = []
  sorted.forEach((tier) => {
    const applied = tier.minQty === appliedMinQty
    const total = totalAtQuantity(basePrice, tier.minQty, computeTierState(sorted, tier.minQty))
    chips.push({
      kind: 'tier',
      qty: tier.minQty,
      label: tier.minQty + ' × ' + formatMoneyFn(total) + (applied ? ' ✓' : ''),
      tone: applied ? 'applied' : tier.minQty === combinedQty ? 'exact' : 'idle',
    })
    if (!onTier && tier.minQty === state.minQty) {
      chips.push({
        kind: 'current',
        qty: combinedQty,
        label: combinedQty + ' × ' + formatMoneyFn(totalAtQuantity(basePrice, combinedQty, state)) + (currentTone === 'highest' ? ' ★' : ''),
        tone: currentTone,
      })
    }
  })
  return chips
}

// "Tier 1 Active (8+ units)"; the top tier is unlimited: "Tier 2 Active (16+ • Unlimited)".
// Tier numbers count the discount's real tiers; the hidden start tier is not one.
export function tierNumberOf(tiers, minQty) {
  const sorted = sortTiersByMinQty(tiers)
  return sorted.findIndex((tier) => tier.minQty === minQty) + (isUnitAnchorTier(sorted[0]) ? 0 : 1)
}

export function formatTierPill({ tiers, minQty }) {
  const sorted = sortTiersByMinQty(tiers)
  const isTop = minQty === sorted[sorted.length - 1].minQty
  return 'Tier ' + tierNumberOf(tiers, minQty) + ' Active (' + minQty + '+' + (isTop ? ' • Unlimited' : ' units') + ')'
}

// The tag at the right of the price row: the tier pill once an offer applies,
// else the High Demand tag when it is switched on, else nothing.
export function buildPriceTag({ progressState, tiers, highDemand }) {
  if (classifyOfferState(progressState) !== 'progress') {
    return { kind: 'tier', text: formatTierPill({ tiers, minQty: progressState.tierState.minQty }) }
  }
  return highDemand ? { kind: 'high-demand', text: 'High Demand' } : null
}
