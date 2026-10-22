// extensions/product-tier-pricing/assets/tier-pricing.js
// One JS asset per theme app extension block (no bundler) — sections below
// stand in for what would be separate modules. Pure math first, DOM last;
// everything above module.exports is unit tested by ../product-tier-pricing-tests.

// Shared pure helpers

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function sortTiersByMinQty(tiers) {
  return tiers.slice().sort((a, b) => a.minQty - b.minQty)
}

// Defaults a tier's percentOff/anchorPrice/fixedPrice (0/null/null) for
// price math. Not used for computeTierState's remainingTiers/nextTier
// previews — those pass percentOff through raw (undefined stays undefined).
function normalizeTierPricing(tier) {
  return {
    percentOff: tier.percentOff != null ? tier.percentOff : 0,
    anchorPrice: tier.anchorPrice != null ? tier.anchorPrice : null,
    fixedPrice: tier.fixedPrice != null ? tier.fixedPrice : null,
  }
}

function formatMoney(amount, format) {
  const withDecimals = amount.toFixed(2)
  return format.replace(/\{\{\s*amount\s*\}\}/, withDecimals)
}

// Tier pricing math

function computeTierState(tiers, quantity) {
  const sorted = sortTiersByMinQty(tiers)
  const reached = sorted.filter((t) => t.minQty <= quantity)
  const notReached = sorted.filter((t) => t.minQty > quantity)

  if (reached.length === 0) {
    return {
      percentOff: 0,
      anchorPrice: null,
      fixedPrice: null,
      minQty: null,
      nextTier: null,
      remainingTiers: notReached.map((t) => ({
        minQty: t.minQty,
        percentOff: t.percentOff,
        fixedPrice: t.fixedPrice != null ? t.fixedPrice : null,
        delta: t.minQty - quantity,
      })),
    }
  }

  const reachedTier = reached[reached.length - 1]

  if (notReached.length === 0) {
    return { ...normalizeTierPricing(reachedTier), minQty: reachedTier.minQty, nextTier: null, remainingTiers: null }
  }

  const next = notReached[0]
  return {
    ...normalizeTierPricing(reachedTier),
    minQty: reachedTier.minQty,
    nextTier: {
      minQty: next.minQty,
      percentOff: next.percentOff,
      fixedPrice: next.fixedPrice != null ? next.fixedPrice : null,
      delta: next.minQty - quantity,
    },
    remainingTiers: null,
  }
}

// Ordered pricing strategies (fixed > anchor > percent). New mode = new
// entry here, not an edit to the existing three.
const PRICING_STRATEGIES = [
  (basePrice, quantity, state) => (state.fixedPrice != null ? clamp(state.fixedPrice, 0, basePrice) : null),
  (basePrice, quantity, state) => {
    if (state.anchorPrice == null) return null
    const extraUnits = quantity - state.minQty
    const totalPaid = state.anchorPrice + extraUnits * basePrice * (1 - state.percentOff / 100)
    return clamp(totalPaid, 0, basePrice * quantity) / quantity
  },
  (basePrice, quantity, state) => basePrice * (1 - state.percentOff / 100),
]

function perUnitPrice(basePrice, quantity, state) {
  for (const strategy of PRICING_STRATEGIES) {
    const price = strategy(basePrice, quantity, state)
    if (price != null) return price
  }
  return basePrice
}

function unitPriceAtTier(basePrice, tier) {
  return perUnitPrice(basePrice, tier.minQty, { ...normalizeTierPricing(tier), minQty: tier.minQty })
}

// Synthetic { minQty: 1, percentOff: 0 } tier so the button row always has
// a "1 x <base price>" anchor and the temp-box gap-detection below has two
// entries to bracket a quantity between, even for single-tier configs.
function withUnitAnchor(tiers) {
  if (!tiers || tiers.length === 0) return tiers
  if (tiers.some((t) => t.minQty === 1)) return tiers
  return [{ minQty: 1, percentOff: 0 }].concat(tiers)
}

// Cart math

// Cart items (from /cart.js) and cart lines (from the Rust Function) both
// carry Shopify's plain numeric ids; this app's own config stores GIDs
// (gid://shopify/Product/123) end to end for everything else. This is the
// one seam where the two meet.
function extractNumericId(id) {
  const str = String(id)
  const lastSlash = str.lastIndexOf('/')
  return lastSlash === -1 ? str : str.slice(lastSlash + 1)
}

// A member with no variantId matches any of that product's cart lines
// (today's whole-product behavior); a member with a variantId matches only
// that specific variant's lines. Members are pre-normalized to numeric ids
// by the caller (parseWidgetConfig), matching cartItems' own numeric ids.
function sumMemberQuantityInCart(cartItems, members) {
  return cartItems.reduce((sum, item) => {
    const matches = members.some((m) => {
      if (String(item.product_id) !== m.productId) return false
      return m.variantId == null || String(item.variant_id) === m.variantId
    })
    return matches ? sum + item.quantity : sum
  }, 0)
}

// True when the given variant id counts as a member of THIS product's
// portion of a discount — null ownVariantIds means the whole (single-variant)
// product is the member, so every variant qualifies; a non-null list means
// only those specific variants do.
function resolveEligibility(ownVariantIds, selectedVariantId) {
  return ownVariantIds == null || ownVariantIds.includes(selectedVariantId)
}

// The on-page stepper floors at 1, not 0 — that floor isn't "one extra
// unit", it's the resting state. Subtracting 1 cancels it, so combinedQty
// (= otherQty + addingQty) lands exactly on the true cart total at rest and
// tracks the stepper 1-for-1 from there. Clamped at 0 for an empty cart.
function cartBaselineOtherQty(trueCartQty) {
  return Math.max(0, trueCartQty - 1)
}

// Progress/derived state

function computeProgressState(tiers, otherQty, addingQty) {
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

function computeTierButtonsSignature(state, basePrice, addingQty) {
  return JSON.stringify(state.tierButtons) + '|' +
    (state.tempBox ? state.tempBox.afterIndex + ':' + state.tempBox.tier.minQty : 'none') +
    // combinedQty, not just the stepper: the temporary box shows the combined
    // quantity, which also moves when the cart changes under a still stepper.
    '|' + state.combinedQty + '|' + addingQty + '|' + basePrice
}

// Copy formatting — formatMoney is injected as an (n) => string abstraction.

function formatTempBoxLabel(progressState, basePrice, formatMoneyFn) {
  if (!progressState.tempBox) return ''
  const qty = progressState.combinedQty
  return qty + ' × ' + formatMoneyFn(perUnitPrice(basePrice, qty, progressState.tierState))
}

function computeOrderSummary(basePrice, addingQty, unitPrice) {
  const total = Math.round(unitPrice * addingQty * 100) / 100
  const fullPrice = Math.round(basePrice * addingQty * 100) / 100
  const savings = Math.round((fullPrice - total) * 100) / 100
  return { total, fullPrice, savings }
}

// Joins a list the way someone would say it out loud ("A, B, or C") rather
// than dumping it with a mechanical separator — used for the promo line so
// it reads the same whether a discount has one tier or several.
function joinNaturally(parts) {
  if (parts.length <= 1) return parts.join('')
  if (parts.length === 2) return parts[0] + ' or ' + parts[1]
  return parts.slice(0, -1).join(', ') + ', or ' + parts[parts.length - 1]
}

// Redesign (Stitch design) view-model pieces: pure, unused by the DOM until the
// layout PRs paint them.

// Progress bar with a dot on the current quantity. Markers sit at each tier's
// own minQty (the synthetic minQty:1 anchor is the start), evenly spaced
// whatever the value gaps. The dot is
// interpolated inside the segment it falls in; past the last tier it stays at
// the end but keeps showing the real quantity. A marker the dot sits exactly
// on is `covered` so the DOM can hide its label under the dot.
function computeProgressDot(sortedTiers, combinedQty) {
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
function classifyOfferState(progressState) {
  const ts = progressState.tierState
  const discounted = ts.fixedPrice != null || ts.percentOff > 0
  if (!discounted) return 'progress'
  return progressState.maxed ? 'highest' : 'offer'
}

function pluralizeUnits(qty) {
  return qty + (qty === 1 ? ' unit' : ' units')
}

// The line under the price before any offer applies: "Mix and match 8+ for
// £1.63 or 16+ for £1.55" (group) / "Buy 8+ for …" (standalone).
function buildPromoLine(tiers, basePrice, formatMoneyFn, isGroup) {
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
function buildStatusCopy({ progressState, tiers, basePrice, formatMoney: formatMoneyFn }) {
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

// role="progressbar" values and the text a screen reader speaks for the bar.
// The value is clamped to the range; the text keeps the real quantity.
function buildProgressSemantics(progressState) {
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
function totalAtQuantity(basePrice, qty, state) {
  return Math.round(perUnitPrice(basePrice, qty, state) * qty * 100) / 100
}

// The hidden "1 × full price" start tier that withUnitAnchor adds: no discount of any kind.
function isUnitAnchorTier(tier) {
  return tier.minQty === 1 && !(tier.percentOff > 0) && tier.fixedPrice == null && tier.anchorPrice == null
}

// The chips of the design: "8 × £13.00" per tier (the exact total for that
// quantity), the applied tier ticked, and a dashed chip for the current
// quantity when it falls between tiers (a star past the top tier). `tone`:
//   tier chips: 'idle', 'applied' (the tier that gives the price now) or
//   'exact' (the quantity is exactly this tier and no offer applies yet);
//   current chip: the offer state ('progress', 'offer' or 'highest').
function buildTierChips({ tiers, basePrice, combinedQty, formatMoney: formatMoneyFn }) {
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
function tierNumberOf(tiers, minQty) {
  const sorted = sortTiersByMinQty(tiers)
  return sorted.findIndex((tier) => tier.minQty === minQty) + (isUnitAnchorTier(sorted[0]) ? 0 : 1)
}

function formatTierPill({ tiers, minQty }) {
  const sorted = sortTiersByMinQty(tiers)
  const isTop = minQty === sorted[sorted.length - 1].minQty
  return 'Tier ' + tierNumberOf(tiers, minQty) + ' Active (' + minQty + '+' + (isTop ? ' • Unlimited' : ' units') + ')'
}

// The tag at the right of the price row: the tier pill once an offer applies,
// else the High Demand tag when it is switched on, else nothing.
function buildPriceTag({ progressState, tiers, highDemand }) {
  if (classifyOfferState(progressState) !== 'progress') {
    return { kind: 'tier', text: formatTierPill({ tiers, minQty: progressState.tierState.minQty }) }
  }
  return highDemand ? { kind: 'high-demand', text: 'High Demand' } : null
}

// Flash sale: the window is two Unix seconds written by the admin. The sale
// runs from its start second up to (not including) its end second.

function flashPhase({ nowSeconds, startsAtUnix, endsAtUnix }) {
  if (nowSeconds < startsAtUnix) return 'before'
  return nowSeconds < endsAtUnix ? 'running' : 'ended'
}

function flashPad(value) {
  return value < 10 ? '0' + value : String(value)
}

// ['04', '18', '49'] while an hour or more is left, else ['18', '49']; never negative.
function flashCountdownParts({ secondsLeft }) {
  const total = Math.max(0, Math.floor(secondsLeft))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours > 0 ? [flashPad(hours), flashPad(minutes), flashPad(seconds)] : [flashPad(minutes), flashPad(seconds)]
}

// "04 : 18 : 49" (hours only while an hour or more is left).
function formatFlashCountdown({ secondsLeft }) {
  return flashCountdownParts({ secondsLeft }).join(' : ')
}

// The compact timer of the chip: "14:32", or "1:00:05" from an hour up.
function formatFlashChip({ secondsLeft }) {
  const parts = flashCountdownParts({ secondsLeft })
  if (parts.length === 3) parts[0] = String(Number(parts[0]))
  return parts.join(':')
}

const FLASH_HIDDEN_BAR = { variant: 'hidden', text: '', label: '', timerParts: [], aside: '', chip: '' }

// The bar at the top of the card. `variant` picks its look (dark with a bolt,
// green banner, dark with a star); `text` is the whole sentence (for screen
// readers), `label` the part before the timer boxes.
//   before the start (teaser on): "Flash sale starts in 02 : 10 : 00"
//   running below the first tier: "Flash sale ends in 04 : 18 : 49"
//   first tier: "Tier 1 unlocked! Flash sale active", "£1.63/ea", the chip
//   a higher tier: "Tier 2 active (£1.55/ea · Keep adding)", the chip
//   before the start without the teaser, and after the end: no bar.
function buildFlashBar({ phase, showTeaser, reachedTier, unitPriceLabel, countdownText, countdownParts, chipText }) {
  if (phase === 'ended' || (phase === 'before' && !showTeaser)) return FLASH_HIDDEN_BAR
  if (phase === 'before') {
    return { variant: 'teaser', text: 'Flash sale starts in ' + countdownText, label: 'Flash sale starts in', timerParts: countdownParts, aside: '', chip: '' }
  }
  if (reachedTier === 0) {
    return { variant: 'ends', text: 'Flash sale ends in ' + countdownText, label: 'Flash sale ends in', timerParts: countdownParts, aside: '', chip: '' }
  }
  if (reachedTier === 1) {
    const first = 'Tier 1 unlocked! Flash sale active'
    return { variant: 'tier-first', text: first, label: first, timerParts: [], aside: unitPriceLabel + '/ea', chip: chipText }
  }
  const higher = 'Tier ' + reachedTier + ' active (' + unitPriceLabel + '/ea · Keep adding)'
  return { variant: 'tier-higher', text: higher, label: higher, timerParts: [], aside: '', chip: chipText }
}

// View-model assembly: decides WHAT the widget shows. The DOM layer below
// only paints whatever this returns.

function computeWidgetViewModel({ tiers, basePrice, compareAtPrice, otherQty, addingQty, isGroup, highDemand, flash, nowSeconds, formatMoney: formatMoneyFn }) {
  const plainPrice = formatMoneyFn(basePrice)
  const hasTiers = !!(tiers && tiers.length > 0)
  const phase = flash && hasTiers ? flashPhase({ nowSeconds, startsAtUnix: flash.startsAtUnix, endsAtUnix: flash.endsAtUnix }) : null
  const secondsLeft = phase === 'before' ? flash.startsAtUnix - nowSeconds : phase ? flash.endsAtUnix - nowSeconds : 0

  // No discount for this variant, or a flash sale that is not running (before
  // its start, or over): the plain price only, with the teaser bar when it is
  // switched on and the start is still ahead.
  if (!hasTiers || (phase && phase !== 'running')) {
    // Without a tier discount, fall back to Shopify's own compare-at price, if
    // the merchant set one, so a plain markdown still shows a crossed-out
    // original price like a tiered discount does.
    const hasCompareAtDiscount = compareAtPrice != null && compareAtPrice > basePrice
    return {
      showCard: false,
      showChrome: !phase || (phase === 'before' && !!flash.showTeaser),
      flashBar: phase ? buildFlashBar({
        phase, showTeaser: !!flash.showTeaser, reachedTier: 0, unitPriceLabel: '',
        countdownText: formatFlashCountdown({ secondsLeft }), countdownParts: flashCountdownParts({ secondsLeft }), chipText: formatFlashChip({ secondsLeft }),
      }) : null,
      discountedPrice: hasCompareAtDiscount ? plainPrice : null,
      plainPrice: hasCompareAtDiscount ? formatMoneyFn(compareAtPrice) : plainPrice,
      progressState: null,
      chips: [],
      tag: null,
      offerState: null,
      dot: null,
      promoLine: '',
      status: null,
      semantics: null,
    }
  }

  const progressState = computeProgressState(tiers, otherQty || 0, addingQty)
  // perUnitPrice, not unitPriceAtTier: this needs the price at the current
  // COMBINED quantity, not at a specific tier's own minQty.
  const unit = perUnitPrice(basePrice, progressState.combinedQty, progressState.tierState)
  const isDiscounted = progressState.tierState.fixedPrice != null || progressState.tierState.percentOff > 0

  const sortedTiers = sortTiersByMinQty(tiers)

  const offerState = classifyOfferState(progressState)
  const flashBar = !flash ? null : buildFlashBar({
    phase: 'running',
    showTeaser: !!flash.showTeaser,
    reachedTier: offerState === 'progress' ? 0 : tierNumberOf(tiers, progressState.tierState.minQty),
    unitPriceLabel: formatMoneyFn(unit),
    countdownText: formatFlashCountdown({ secondsLeft }),
    countdownParts: flashCountdownParts({ secondsLeft }),
    chipText: formatFlashChip({ secondsLeft }),
  })

  return {
    showCard: true,
    showChrome: true,
    flashBar,
    discountedPrice: isDiscounted ? formatMoneyFn(unit) : null,
    plainPrice,
    progressState,
    chips: buildTierChips({ tiers, basePrice, combinedQty: progressState.combinedQty, formatMoney: formatMoneyFn }),
    tag: buildPriceTag({ progressState, tiers, highDemand: !!highDemand }),
    offerState,
    dot: computeProgressDot(sortedTiers, progressState.combinedQty),
    promoLine: buildPromoLine(tiers, basePrice, formatMoneyFn, isGroup),
    status: buildStatusCopy({ progressState, tiers, basePrice, formatMoney: formatMoneyFn }),
    semantics: buildProgressSemantics(progressState),
  }
}

// Mix & match product list — pure row-building, then a thin DOM paint.

// The price label of a row: its own price at the per-unit price the applied
// tier gives it ('' without a price or without pricing context).
function formatRowPrice({ priceCents, pricing }) {
  if (priceCents == null || !pricing) return ''
  return pricing.formatMoney(perUnitPrice(priceCents / 100, pricing.combinedQty, pricing.tierState))
}

// `pricing` ({ combinedQty, tierState, formatMoney }) prices each row; null
// leaves the price label empty. Prices in `products` are Shopify's integer
// minor units (cents). A row shows what is in the cart (`qty`) and, unless it is
// the product on the page or sold out, an Add link to that product (`showAdd`).
function buildMixMatchRows({ products, cartItems, pricing, currentVariantId }) {
  return products.map((product) => {
    const member = { productId: extractNumericId(product.productId), variantId: product.variantId ? extractNumericId(product.variantId) : undefined }
    const cartVariantId = product.cartVariantId != null ? String(product.cartVariantId) : null
    const isCurrent = cartVariantId != null && currentVariantId != null && cartVariantId === String(currentVariantId)
    const available = product.available !== false
    return {
      // The theme (Liquid) builds the link from the live product, including any ?variant= query.
      href: product.url,
      title: product.title,
      imageUrl: product.imageUrl || null,
      qty: sumMemberQuantityInCart(cartItems || [], [member]),
      priceLabel: formatRowPrice({ priceCents: product.price, pricing }),
      available,
      showAdd: available && !isCurrent,
    }
  })
}

function formatItemsChosen(qty) {
  return qty + (qty === 1 ? ' item chosen' : ' items chosen')
}

// Cross-product siblings plus every one of this product's own other
// member-variants, INCLUDING whichever one is currently selected/displayed.
// Previously excluded the current variant on the theory that showing "the
// exact one you're looking at" would be confusing — in practice that made
// its cart quantity invisible everywhere in the widget (e.g. viewing
// Chicken with 2 already in the cart: the list showed the other members'
// counts but never Chicken's, so 5 real combined units looked like only 3
// were accounted for). Cross-product siblings were never excluded this way
// either, so this also makes same-product and cross-product members behave
// consistently. Own-variant rows link back to this same product with a
// ?variant= query param so clicking one selects that flavour (a no-op for
// the row matching the currently-displayed variant).
function buildDisplayMixMatchItems(config) {
  const ownRows = (config.ownVariantOptions || []).map((opt) => ({
    productId: config.productId,
    variantId: opt.variantId,
    title: opt.title,
    url: opt.url,
    imageUrl: opt.imageUrl || null,
    price: opt.price,
    available: opt.available,
    cartVariantId: opt.cartVariantId,
  }))
  return ownRows.concat(config.mixMatchListItems)
}

// Siblings that still resolve in the store. A sibling whose product was deleted
// or unpublished stays in `siblings` (its units still count toward the combined
// quantity) but is not shown in the list.
function listedMixMatchItems(siblings) {
  return (siblings || []).filter((sibling) => sibling.listed)
}

// Rows of a time-based discount for ONE product: [{ variantId: string|null,
// pricingMode, amount }]. Current metafields carry `items`; metafields written
// before per-row pricing carry one rule at the top level (pricingMode/amount)
// plus `variantIds` (null/empty = every variant). Named with a tier prefix
// because this file shares one global scope with time-based-discount.js.
function tierTimeDiscountItems(discount) {
  if (Array.isArray(discount.items)) return discount.items
  if (discount.pricingMode !== 'percent' && discount.pricingMode !== 'fixed') return []
  const rule = { pricingMode: discount.pricingMode, amount: discount.amount }
  const ids = discount.variantIds
  if (!ids || ids.length === 0) return [{ variantId: null, ...rule }]
  return ids.map((id) => ({ variantId: id, ...rule }))
}

// The variant's own row wins; otherwise the whole-product row (variantId null).
function tierTimeDiscountItemFor(items, variantId) {
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
function timeDiscountSalePrice({ basePrice, discount, variantId }) {
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
function isTimeDiscountWindowActive(discount, now) {
  if (!discount || !discount.startsAt || !discount.endsAt) return false
  const start = new Date(discount.startsAt).getTime()
  const end = new Date(discount.endsAt).getTime()
  const nowMs = now.getTime()
  return nowMs >= start && nowMs < end
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isTimeDiscountWindowActive,
    tierTimeDiscountItems,
    tierTimeDiscountItemFor,
    timeDiscountSalePrice,
    clamp,
    sortTiersByMinQty,
    normalizeTierPricing,
    formatMoney,
    computeTierState,
    perUnitPrice,
    extractNumericId,
    sumMemberQuantityInCart,
    resolveEligibility,
    unitPriceAtTier,
    computeProgressState,
    formatTempBoxLabel,
    joinNaturally,
    computeOrderSummary,
    computeTierButtonsSignature,
    withUnitAnchor,
    cartBaselineOtherQty,
    computeProgressDot,
    classifyOfferState,
    buildPromoLine,
    buildStatusCopy,
    totalAtQuantity,
    isUnitAnchorTier,
    buildTierChips,
    formatTierPill,
    buildPriceTag,
    tierNumberOf,
    flashPhase,
    flashCountdownParts,
    formatFlashCountdown,
    formatFlashChip,
    buildFlashBar,
    computeWidgetViewModel,
    buildMixMatchRows,
    buildProgressSemantics,
    formatItemsChosen,
    buildDisplayMixMatchItems,
    listedMixMatchItems,
  }
}

// DOM: element painting — copies view-model fields onto the page, no calculation.

if (typeof document !== 'undefined') {
  function createMoneyFormatter(moneyFormat) {
    return (amount) => formatMoney(amount, moneyFormat)
  }

  // Rewrites text only when it changed: live regions re-announce on every
  // write, and the widget repaints once a second.
  function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text
  }

  function paintPriceRow(elements, viewModel) {
    // Screen readers would otherwise read the two prices as bare numbers.
    if (viewModel.discountedPrice) {
      const priceHtml = '<span class="sparkly-tier-pricing__sr-only">Discounted price: </span>' + viewModel.discountedPrice
      if (elements.priceEl.innerHTML !== priceHtml) elements.priceEl.innerHTML = priceHtml
    } else {
      setText(elements.priceEl, viewModel.plainPrice)
    }
    // The original price, struck, sits after "each".
    if (elements.struckEl) {
      elements.struckEl.hidden = !viewModel.discountedPrice
      if (viewModel.discountedPrice) {
        const struckHtml = '<span class="sparkly-tier-pricing__sr-only">Original price: </span>' + viewModel.plainPrice
        if (elements.struckEl.innerHTML !== struckHtml) elements.struckEl.innerHTML = struckHtml
      }
    }
    // "each" only makes sense once there's a per-unit/bulk-pricing story to
    // explain — showCard already means "this product has a discount
    // configured", the same condition that should hide it.
    if (elements.eachLabelEl) elements.eachLabelEl.hidden = !viewModel.showCard
    paintTag(elements, viewModel)
  }

  // The tag at the right of the price row: the tier pill, the High Demand tag, or nothing.
  function paintTag(elements, viewModel) {
    const el = elements.tagEl
    if (!el) return
    const tag = viewModel.tag
    el.hidden = !tag
    if (!tag) return
    if (el.dataset.kind !== tag.kind) el.dataset.kind = tag.kind
    setText(el, tag.text)
  }

  // The promo line stays in every state; the status row below carries what changes.
  function paintPromo(elements, viewModel) {
    if (!elements.promoEl) return
    setText(elements.promoEl, viewModel.promoLine)
  }

  function paintCard(elements, viewModel) {
    if (elements.cardEl) elements.cardEl.hidden = !viewModel.showCard
  }

  // Status row: "You have <b>5 units</b>" on the left (the quantity in bold),
  // the hint on the right in the colour of the state. Rebuilt only when the
  // text changed: live regions re-announce on every write.
  function paintStatus(elements, viewModel) {
    const status = viewModel.status
    if (!status) return
    if (elements.statusEl && elements.statusEl.dataset.text !== status.statusText) {
      elements.statusEl.dataset.text = status.statusText
      elements.statusEl.textContent = ''
      const strong = document.createElement('strong')
      strong.textContent = status.statusParts.strong
      elements.statusEl.append(status.statusParts.before, strong, status.statusParts.after)
    }
    if (elements.asideEl) {
      setText(elements.asideEl, status.hintText || '')
      if (elements.asideEl.dataset.tone !== status.hintTone) elements.asideEl.dataset.tone = status.hintTone
    }
  }

  // Rail: fill up to the dot, a pin per tier quantity, and the dot showing the
  // current quantity. A pin the dot sits on is hidden under it. Positions go
  // through --sparkly-tier-pct so the stylesheet keeps the end pins inside the rail.
  function paintProgressBar(elements, dot, semantics, offerState) {
    elements.fillEl.style.width = dot.dotPct + '%'
    elements.markersEl.innerHTML = ''
    dot.markers.forEach((marker) => {
      const el = document.createElement('span')
      el.className = 'sparkly-tier-pricing__marker' +
        (marker.reached ? ' sparkly-tier-pricing__marker--reached' : '') +
        (marker.covered ? ' sparkly-tier-pricing__marker--covered' : '')
      el.style.setProperty('--sparkly-tier-pct', marker.pct + '%')
      el.textContent = String(marker.value)
      elements.markersEl.appendChild(el)
    })
    elements.dotEl.style.setProperty('--sparkly-tier-pct', dot.dotPct + '%')
    elements.dotEl.textContent = String(dot.dotValue)
    if (elements.railEl && offerState) elements.railEl.dataset.offerState = offerState
    if (elements.barEl) {
      if (semantics) {
        elements.barEl.setAttribute('aria-valuenow', String(semantics.valueNow))
        elements.barEl.setAttribute('aria-valuemin', String(semantics.valueMin))
        elements.barEl.setAttribute('aria-valuemax', String(semantics.valueMax))
        elements.barEl.setAttribute('aria-valuetext', semantics.valueText)
      }
    }
  }

  // One chip per tier ("8 × £13.00", the applied tier ticked); a dashed chip
  // between two tiers shows the total for the quantity that sits between them.
  // Only the tier chips are buttons: they set the quantity on the page.
  function paintChips(elements, viewModel) {
    const combinedQty = viewModel.progressState.combinedQty
    elements.tiersEl.innerHTML = ''
    viewModel.chips.forEach((chip) => {
      const isTier = chip.kind === 'tier'
      const el = document.createElement(isTier ? 'button' : 'span')
      el.className = 'sparkly-tier-pricing__chip sparkly-tier-pricing__chip--' + (isTier ? '' : 'current-') + chip.tone
      el.textContent = chip.label
      if (isTier) {
        el.type = 'button'
        el.setAttribute('aria-pressed', chip.qty === combinedQty ? 'true' : 'false')
        el.addEventListener('click', () => setQuantityInput(chip.qty))
      }
      elements.tiersEl.appendChild(el)
    })
  }

  // The flash bar: the sentence, the timer as one box per part (teaser and
  // "ends in" only), the unit price on the right and the timer chip. Text is
  // only rewritten when it changed; the timer changes every second.
  function paintFlashBar(elements, viewModel) {
    const el = elements.flashEl
    if (!el) return
    const bar = viewModel.flashBar
    el.hidden = !bar || bar.variant === 'hidden'
    if (el.hidden) return
    if (el.dataset.variant !== bar.variant) el.dataset.variant = bar.variant
    setText(elements.flashLabelEl, bar.label)
    paintFlashTimer(elements.flashTimerEl, bar.timerParts)
    setText(elements.flashAsideEl, bar.aside)
    elements.flashChipEl.hidden = !bar.chip
    setText(elements.flashChipTextEl, bar.chip)
  }

  function paintFlashTimer(timerEl, parts) {
    if (!timerEl) return
    if (parts.length === 0) {
      if (timerEl.children.length > 0) timerEl.textContent = ''
      return
    }
    if (timerEl.children.length !== parts.length * 2 - 1) {
      timerEl.textContent = ''
      parts.forEach((part, index) => {
        if (index > 0) {
          const sep = document.createElement('span')
          sep.className = 'sparkly-tier-pricing__flash-sep'
          sep.textContent = ':'
          timerEl.appendChild(sep)
        }
        const digit = document.createElement('span')
        digit.className = 'sparkly-tier-pricing__flash-digit'
        timerEl.appendChild(digit)
      })
    }
    parts.forEach((part, index) => setText(timerEl.children[index * 2], part))
  }

  // Skips the destructive rebuild (replays animation, clears focus) when
  // nothing chip-related changed since last render — tracked via a
  // signature on tierButtonsSignatureRef, a { value } box the caller owns.
  function paintProgressCard(elements, viewModel, basePrice, addingQty, tierButtonsSignatureRef) {
    if (!viewModel.showCard || !viewModel.progressState) return
    const state = viewModel.progressState

    paintProgressBar(elements, viewModel.dot, viewModel.semantics, viewModel.offerState)

    const signature = computeTierButtonsSignature(state, basePrice, addingQty)
    if (tierButtonsSignatureRef.value === signature) return
    tierButtonsSignatureRef.value = signature
    paintChips(elements, viewModel)
  }

  function paintWidget(elements, viewModel, basePrice, addingQty, tierButtonsSignatureRef) {
    paintFlashBar(elements, viewModel)
    paintPriceRow(elements, viewModel)
    paintPromo(elements, viewModel)
    paintCard(elements, viewModel)
    paintProgressCard(elements, viewModel, basePrice, addingQty, tierButtonsSignatureRef)
    paintStatus(elements, viewModel)
  }

  // One row per member: thumbnail, name and price (a link to the product), the
  // number in the cart, and a small Add link that opens the product.
  function paintMixMatchList(listEl, rows) {
    listEl.innerHTML = ''
    rows.forEach((row) => {
      const item = document.createElement('div')
      item.className = 'sparkly-tier-pricing__list-item'

      const link = document.createElement('a')
      link.href = row.href
      link.className = 'sparkly-tier-pricing__list-link'

      if (row.imageUrl) {
        const img = document.createElement('img')
        img.src = row.imageUrl
        img.alt = ''
        img.className = 'sparkly-tier-pricing__list-thumb'
        link.appendChild(img)
      } else {
        const placeholder = document.createElement('span')
        placeholder.className = 'sparkly-tier-pricing__list-thumb sparkly-tier-pricing__list-thumb--placeholder'
        link.appendChild(placeholder)
      }

      const text = document.createElement('span')
      text.className = 'sparkly-tier-pricing__list-text'
      const name = document.createElement('span')
      name.className = 'sparkly-tier-pricing__list-name'
      name.textContent = row.title
      text.appendChild(name)
      const price = document.createElement('span')
      price.className = 'sparkly-tier-pricing__list-price'
      price.textContent = row.available ? (row.priceLabel ? row.priceLabel + ' each' : '') : 'Sold out'
      text.appendChild(price)
      link.appendChild(text)
      item.appendChild(link)

      item.appendChild(paintRowAction(row))

      listEl.appendChild(item)
    })
  }

  // The number in the cart plus, when the product can be added, an "Add" link to
  // it (the product on the page and sold-out rows have none).
  function paintRowAction(row) {
    const group = document.createElement('div')
    group.className = 'sparkly-tier-pricing__row-action'

    const count = document.createElement('span')
    count.className = 'sparkly-tier-pricing__list-qty'
    count.textContent = String(row.qty)
    count.setAttribute('aria-label', row.qty + ' in cart')
    group.appendChild(count)

    if (row.showAdd) {
      const add = document.createElement('a')
      add.href = row.href
      add.className = 'sparkly-tier-pricing__add'
      add.textContent = '+ Add'
      add.setAttribute('aria-label', 'Add ' + row.title)
      group.appendChild(add)
    }
    return group
  }

  function renderMixMatchList({ listEl, products, cartItems, pricing, currentVariantId }) {
    paintMixMatchList(listEl, buildMixMatchRows({ products, cartItems, pricing, currentVariantId }))
  }

  function setQuantityInput(value) {
    const input = document.querySelector('input[name="quantity"]')
    if (!input) return
    input.value = String(value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  // DOM: cart access

  async function fetchCart() {
    const res = await fetch('/cart.js')
    return res.json()
  }

  async function fetchGroupCartState(allMembers, selfMember) {
    const cart = await fetchCart()
    const trueCartQty = sumMemberQuantityInCart(cart.items, allMembers)
    return {
      otherQty: cartBaselineOtherQty(trueCartQty),
      selfQty: sumMemberQuantityInCart(cart.items, [selfMember]),
      cartItems: cart.items,
    }
  }

  // Resets the stepper to 1 once this product's cart qty is observed to
  // increase — this theme's native stepper does NOT do this itself
  // (confirmed live). Without it, the next render double-counts: the
  // just-added units land in the fresh otherQty AND the stale addingQty.
  function resetStepperIfJustAdded(lastKnownSelfQtyRef, selfQtyNow) {
    if (lastKnownSelfQtyRef.value != null && selfQtyNow > lastKnownSelfQtyRef.value) {
      setQuantityInput(1)
    }
    lastKnownSelfQtyRef.value = selfQtyNow
  }

  // DOM: per-widget setup

  function parseWidgetConfig(container) {
    const discount = JSON.parse(container.dataset.discount)
    const moneyFormat = JSON.parse(container.dataset.moneyFormat)
    const productId = JSON.parse(container.dataset.productId)
    const tiers = withUnitAnchor(discount.tiers)

    const selfProductId = extractNumericId(productId)
    const ownVariantIds = discount.ownVariantIds ? discount.ownVariantIds.map(extractNumericId) : null
    const ownMembers = ownVariantIds
      ? ownVariantIds.map((v) => ({ productId: selfProductId, variantId: v }))
      : [{ productId: selfProductId }]
    const ownVariantOptions = (discount.ownVariantOptions || []).map((o) => ({
      variantId: extractNumericId(o.variantId),
      title: o.title,
      url: o.url,
      imageUrl: o.imageUrl || null,
      price: o.price,
      available: o.available,
      cartVariantId: o.cartVariantId != null ? String(o.cartVariantId) : null,
    }))
    const siblingMembers = (discount.siblings || []).map((s) => ({
      productId: extractNumericId(s.productId),
      variantId: s.variantId ? extractNumericId(s.variantId) : undefined,
    }))
    const allMembers = ownMembers.concat(siblingMembers)

    return {
      moneyFormat,
      productId: selfProductId,
      tiers,
      title: discount.title,
      highDemand: container.dataset.highDemand === 'true',
      flash: parseFlashConfig(container.dataset.flash),
      hasTiers: !!(tiers && tiers.length > 0),
      ownVariantIds,
      ownVariantOptions,
      // A product with only a time-based discount has no tier discount blob
      // (so no selfVariantId); the block still renders the selected variant's
      // id on the container, and the sale price depends on it from first paint.
      initialVariantId: discount.selfVariantId
        ? extractNumericId(discount.selfVariantId)
        : container.dataset.selectedVariantId || null,
      allMembers,
      mixMatchListItems: listedMixMatchItems(discount.siblings),
      isGroup: allMembers.length > 1,
    }
  }

  // { startsAtUnix, endsAtUnix, showTeaser } of a flash sale, or null for a discount that is not one.
  function parseFlashConfig(raw) {
    try {
      const flash = JSON.parse(raw || 'null')
      return flash && typeof flash.startsAtUnix === 'number' && typeof flash.endsAtUnix === 'number' ? flash : null
    } catch {
      return null
    }
  }

  function queryWidgetElements(container) {
    return {
      flashEl: container.querySelector('[data-tier-pricing-flash]'),
      flashLabelEl: container.querySelector('[data-flash-label]'),
      flashTimerEl: container.querySelector('[data-flash-timer]'),
      flashAsideEl: container.querySelector('[data-flash-aside]'),
      flashChipEl: container.querySelector('[data-flash-chip]'),
      flashChipTextEl: container.querySelector('[data-flash-chip-text]'),
      priceEl: container.querySelector('[data-tier-pricing-price]'),
      eachLabelEl: container.querySelector('[data-tier-pricing-each-label]'),
      struckEl: container.querySelector('[data-tier-pricing-struck]'),
      tagEl: container.querySelector('[data-tier-pricing-tag]'),
      promoEl: container.querySelector('[data-tier-pricing-promo]'),
      cardEl: container.querySelector('[data-tier-pricing-card]'),
      statusEl: container.querySelector('[data-tier-pricing-status]'),
      asideEl: container.querySelector('[data-tier-pricing-aside]'),
      fillEl: container.querySelector('[data-tier-pricing-fill]'),
      barEl: container.querySelector('[data-tier-pricing-bar]'),
      railEl: container.querySelector('[data-tier-pricing-rail]'),
      markersEl: container.querySelector('[data-tier-pricing-markers]'),
      dotEl: container.querySelector('[data-tier-pricing-dot]'),
      tiersEl: container.querySelector('[data-tier-pricing-tiers]'),
      drawerEl: container.querySelector('[data-tier-pricing-drawer]'),
      toggleEl: container.querySelector('[data-tier-pricing-toggle]'),
      listEl: container.querySelector('[data-tier-pricing-list]'),
      chosenEl: container.querySelector('[data-tier-pricing-chosen]'),
    }
  }

  // Builds the render cycle and wires the mix & match toggle (needs the
  // same last-fetched-cart state the render cycle owns). Returns `render`;
  // every other listener is wired from initTierPricing against it.
  function createRenderer(container, config, elements) {
    const tierButtonsSignatureRef = { value: null }
    const lastKnownSelfQtyRef = { value: null }
    const variantStateRef = { value: config.initialVariantId }
    const formatMoneyFn = createMoneyFormatter(config.moneyFormat)
    let lastCartItems = []
    let lastPricing = null

    async function render() {
      const basePrice = Number(container.dataset.basePrice)
      const compareAtPrice = Number(container.dataset.compareAtPrice) || 0
      const quantityInput = document.querySelector('input[name="quantity"]')
      const addingQty = quantityInput ? Number(quantityInput.value) || 1 : 1
      const eligible = resolveEligibility(config.ownVariantIds, variantStateRef.value)
      // The specific on-screen variant, not allMembers[0] — allMembers[0] is
      // just the first of possibly several own-variant members and would
      // misattribute stepper-reset detection once a product has more than
      // one own member variant.
      const selfMemberNow = { productId: config.productId, variantId: variantStateRef.value }

      let otherQty = 0
      if (config.hasTiers) {
        try {
          const cartState = await fetchGroupCartState(config.allMembers, selfMemberNow)
          lastCartItems = cartState.cartItems
          otherQty = cartState.otherQty
          resetStepperIfJustAdded(lastKnownSelfQtyRef, cartState.selfQty)
        } catch {
          otherQty = 0
        }
      }

      const viewModel = computeWidgetViewModel({
        tiers: eligible ? config.tiers : [],
        basePrice,
        compareAtPrice,
        otherQty,
        addingQty,
        isGroup: config.isGroup,
        highDemand: config.highDemand,
        flash: config.flash,
        nowSeconds: Math.floor(Date.now() / 1000),
        formatMoney: formatMoneyFn,
      })
      // A flash sale that has not started (teaser off) or is over has no card: only the plain price.
      if (config.hasTiers) container.classList.toggle('sparkly-tier-pricing--card', viewModel.showChrome)
      paintWidget(elements, viewModel, basePrice, addingQty, tierButtonsSignatureRef)
      lastPricing = viewModel.progressState
        ? { combinedQty: viewModel.progressState.combinedQty, tierState: viewModel.progressState.tierState, formatMoney: formatMoneyFn }
        : null

      const timeDiscountJson = container.dataset.timeDiscount
      if (timeDiscountJson) {
        updateTimeDiscountDisplay(container, timeDiscountJson, basePrice, variantStateRef.value, formatMoneyFn)
      }

      paintList()
    }

    function paintList() {
      if (!(config.isGroup && elements.listEl && !elements.listEl.hidden)) return
      renderMixMatchList({
        listEl: elements.listEl,
        products: buildDisplayMixMatchItems(config),
        cartItems: lastCartItems,
        pricing: lastPricing,
        currentVariantId: variantStateRef.value,
      })
      if (lastPricing) setText(elements.chosenEl, formatItemsChosen(lastPricing.combinedQty))
    }

    // Liquid now renders the toggle+list markup unconditionally (see the
    // comment on data-discount above) — isGroup is fixed at metafield-sync
    // time (total member count), not per-variant, so hiding it once here
    // (rather than every render) is correct and matches how paintCard
    // already owns cardEl's hidden state.
    if (elements.drawerEl) elements.drawerEl.hidden = !config.isGroup

    if (elements.toggleEl && elements.listEl && config.isGroup) {
      let open = false
      elements.toggleEl.addEventListener('click', () => {
        open = !open
        elements.listEl.hidden = !open
        if (elements.chosenEl) elements.chosenEl.hidden = !open
        if (elements.drawerEl) elements.drawerEl.dataset.open = open ? 'true' : 'false'
        elements.toggleEl.setAttribute('aria-expanded', open ? 'true' : 'false')
        if (open) paintList()
      })
    }

    render.variantStateRef = variantStateRef
    return render
  }

  // DOM: event wiring — each function attaches one behavior and calls render().

  function wireQuantityStepper(render) {
    const quantityInput = document.querySelector('input[name="quantity"]')
    if (!quantityInput) return

    quantityInput.addEventListener('input', render)
    quantityInput.addEventListener('change', render)

    // This theme's +/- buttons set the input's value without dispatching
    // input/change, so hook the buttons directly. Scoped to this widget's
    // own quantity input, not document-wide — the cart drawer's steppers
    // share the same aria-labels.
    const quantityScope = quantityInput.closest('product-quantity') || quantityInput.closest('form') || document
    quantityScope.querySelectorAll('button[aria-label="Increase quantity"], button[aria-label="Decrease quantity"]').forEach((btn) => {
      btn.addEventListener('click', () => setTimeout(render, 0))
    })
  }

  function wireAddToCartForm(render) {
    const addToCartForm = document.querySelector('form[action*="/cart/add"]')
    if (!addToCartForm) return
    // Best-effort immediate re-check; self-corrects on the next poll if
    // /cart/add.js hasn't finished yet.
    addToCartForm.addEventListener('submit', () => render())
  }

  function wireVariantChange(container, render) {
    const productVariantsEl = document.querySelector('product-variants')
    if (!productVariantsEl) return

    productVariantsEl.addEventListener('VARIANT_CHANGE', (event) => {
      const variant = event.target.currentVariant
      if (variant && variant.id != null && render.variantStateRef) {
        render.variantStateRef.value = extractNumericId(variant.id)
      }
      if (variant && typeof variant.price === 'number') {
        container.dataset.basePrice = String(variant.price / 100)
      }
      // Compare-at price is variant-specific too — keep it in sync so
      // switching to a non-discounted variant doesn't leave a stale
      // crossed-out price on screen. Accepts either casing the theme's
      // variant object might use.
      const variantCompareAt = variant && (variant.compareAtPrice != null ? variant.compareAtPrice : variant.compare_at_price)
      if (typeof variantCompareAt === 'number') {
        container.dataset.compareAtPrice = String(variantCompareAt / 100)
      }
      render()
    })
  }

  function wireLoopSubscriptionsPricePoll(container, render) {
    let lastLoopPriceText = null
    setInterval(() => {
      const loopPriceEl = document.querySelector(
        '.loop-w-btn-group-purchase-option-selected .loop-w-btn-group-purchase-option-price',
      )
      if (!loopPriceEl) return
      const text = loopPriceEl.textContent
      if (text === lastLoopPriceText) return
      lastLoopPriceText = text
      const match = text.match(/\d+\.\d{2}|\d+/)
      if (match) {
        container.dataset.basePrice = match[0]
        render()
      }
    }, 200)
  }

  function wireCartAwarePolling(render) {
    setInterval(render, 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') render()
    })
  }

  function parseTimeDiscount(timeDiscountJson) {
    try {
      return JSON.parse(timeDiscountJson)
    } catch {
      return null
    }
  }

  function parseActiveTimeDiscount(timeDiscountJson) {
    const discount = parseTimeDiscount(timeDiscountJson)
    return isTimeDiscountWindowActive(discount, new Date()) ? discount : null
  }

  // While a time-based discount is running, the same price row the tier
  // discounts use shows the sale price with the regular price struck beside
  // it (the CSS in tier-pricing.liquid puts the sale price on the left).
  function updateTimeDiscountDisplay(container, timeDiscountJson, basePrice, variantId, formatMoneyFn) {
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
  function wireTimeDiscountBoundaries(container, render) {
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

  function initTierPricing() {
    document.querySelectorAll('[data-sparkly-tier-pricing]').forEach((container) => {
      const config = parseWidgetConfig(container)
      const elements = queryWidgetElements(container)
      const render = createRenderer(container, config, elements)

      render()

      wireQuantityStepper(render)
      wireAddToCartForm(render)
      wireVariantChange(container, render)
      wireLoopSubscriptionsPricePoll(container, render)
      if (config.hasTiers) wireCartAwarePolling(render)
      wireTimeDiscountBoundaries(container, render)
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTierPricing)
  } else {
    initTierPricing()
  }
}
