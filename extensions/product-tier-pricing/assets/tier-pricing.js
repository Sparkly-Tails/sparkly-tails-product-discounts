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

  return { combinedQty, topThreshold, maxed, tierState, tierButtons, tempBox }
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

// Status row + headline copy per state. `hintText`/`badgeText` go in the
// status row's right-hand slot; `headlineText` replaces the promo line under
// the price once an offer applies. No "Tier N" wording: middle tiers read
// "Offer unlocked", the top one "Highest discount unlocked".
function buildStatusCopy({ progressState, tiers, basePrice, formatMoney: formatMoneyFn }) {
  const state = classifyOfferState(progressState)
  const sorted = sortTiersByMinQty(tiers)
  const qty = progressState.combinedQty
  const ts = progressState.tierState
  const unit = perUnitPrice(basePrice, qty, ts)
  const savings = computeOrderSummary(basePrice, qty, unit).savings
  const nextRaw = ts.nextTier || (ts.remainingTiers && ts.remainingTiers[0])
  // The state's nextTier only carries minQty/percentOff/fixedPrice; price the
  // configured tier itself so an anchor tier is priced right.
  const next = nextRaw ? sorted.find((t) => t.minQty === nextRaw.minQty) : null
  const nextPrice = next ? formatMoneyFn(unitPriceAtTier(basePrice, next)) : null

  if (state === 'progress') {
    return {
      state,
      statusText: 'You have ' + pluralizeUnits(qty),
      hintText: next ? 'Add ' + nextRaw.delta + ' for ' + nextPrice + '/ea' : null,
      badgeText: null,
      headlineText: null,
    }
  }
  if (state === 'offer') {
    const nextIsHighest = next && next.minQty === progressState.topThreshold
    return {
      state,
      statusText: pluralizeUnits(qty) + ' × ' + formatMoneyFn(unit) + ' (Offer unlocked)',
      hintText: null,
      badgeText: 'Save ' + formatMoneyFn(savings),
      headlineText: 'Offer unlocked! Add ' + nextRaw.delta + ' more to unlock ' + (nextIsHighest ? 'the highest discount' : 'the next offer') + ' for ' + nextPrice,
    }
  }
  return {
    state,
    statusText: 'You have ' + pluralizeUnits(qty),
    hintText: '✓ Highest discount (' + formatMoneyFn(unit) + '/ea)',
    badgeText: null,
    headlineText: 'Highest discount unlocked: ' + formatMoneyFn(unit) + '/each applied! (Save ' + formatMoneyFn(savings) + ')',
  }
}

// View-model assembly: decides WHAT the widget shows. The DOM layer below
// only paints whatever this returns.

function computeWidgetViewModel({ tiers, basePrice, compareAtPrice, otherQty, addingQty, isGroup, formatMoney: formatMoneyFn }) {
  const plainPrice = formatMoneyFn(basePrice)

  if (!tiers || tiers.length === 0) {
    // No app discount configured for this product — fall back to Shopify's
    // own compare-at price, if the merchant set one, so a plain markdown
    // still shows a crossed-out original price like a tiered discount does.
    const hasCompareAtDiscount = compareAtPrice != null && compareAtPrice > basePrice
    return {
      showCard: false,
      discountedPrice: hasCompareAtDiscount ? plainPrice : null,
      plainPrice: hasCompareAtDiscount ? formatMoneyFn(compareAtPrice) : plainPrice,
      progressState: null,
      tierButtons: [],
      tempBoxLabel: null,
      tempBoxAfterIndex: null,
      offerState: null,
      dot: null,
      promoLine: '',
      status: null,
    }
  }

  const progressState = computeProgressState(tiers, otherQty || 0, addingQty)
  // perUnitPrice, not unitPriceAtTier: this needs the price at the current
  // COMBINED quantity, not at a specific tier's own minQty.
  const unit = perUnitPrice(basePrice, progressState.combinedQty, progressState.tierState)
  const isDiscounted = progressState.tierState.fixedPrice != null || progressState.tierState.percentOff > 0

  const sortedTiers = sortTiersByMinQty(tiers)
  // "8 × £1.63": the unit price at each tier. Tiers below the applied one are
  // dimmed; none are before the first offer applies.
  const appliedMinQty = classifyOfferState(progressState) === 'progress' ? 0 : progressState.tierState.minQty
  const tierButtons = progressState.tierButtons.map((btn, i) => ({
    minQty: btn.minQty,
    active: btn.active,
    dimmed: btn.minQty < appliedMinQty,
    label: btn.minQty + ' × ' + formatMoneyFn(unitPriceAtTier(basePrice, sortedTiers[i])),
  }))

  return {
    showCard: true,
    discountedPrice: isDiscounted ? formatMoneyFn(unit) : null,
    plainPrice,
    progressState,
    tierButtons,
    tempBoxLabel: progressState.tempBox ? formatTempBoxLabel(progressState, basePrice, formatMoneyFn) : null,
    tempBoxAfterIndex: progressState.tempBox ? progressState.tempBox.afterIndex : null,
    offerState: classifyOfferState(progressState),
    dot: computeProgressDot(sortedTiers, progressState.combinedQty),
    promoLine: buildPromoLine(tiers, basePrice, formatMoneyFn, isGroup),
    status: buildStatusCopy({ progressState, tiers, basePrice, formatMoney: formatMoneyFn }),
  }
}

// Mix & match product list — pure row-building, then a thin DOM paint.

function buildMixMatchRows(products, cartItems) {
  return products.map((product) => {
    const member = { productId: extractNumericId(product.productId), variantId: product.variantId ? extractNumericId(product.variantId) : undefined }
    const qty = sumMemberQuantityInCart(cartItems || [], [member])
    return {
      // The theme (Liquid) builds the link from the live product, including any ?variant= query.
      href: product.url,
      title: product.title,
      imageUrl: product.imageUrl || null,
      qtyLabel: qty === 1 ? '1 in cart' : qty + ' in cart',
    }
  })
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
    imageUrl: null,
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
    computeWidgetViewModel,
    buildMixMatchRows,
    buildDisplayMixMatchItems,
    listedMixMatchItems,
  }
}

// DOM: element painting — copies view-model fields onto the page, no calculation.

if (typeof document !== 'undefined') {
  function createMoneyFormatter(moneyFormat) {
    return (amount) => formatMoney(amount, moneyFormat)
  }

  function paintPriceRow(elements, viewModel) {
    if (viewModel.discountedPrice) {
      elements.priceEl.innerHTML = viewModel.discountedPrice + ' <s>' + viewModel.plainPrice + '</s>'
    } else {
      elements.priceEl.textContent = viewModel.plainPrice
    }
    // "each" only makes sense once there's a per-unit/bulk-pricing story to
    // explain — showCard already means "this product has a discount
    // configured", the same condition that should hide it.
    if (elements.eachLabelEl) elements.eachLabelEl.hidden = !viewModel.showCard
  }

  function paintPromo(elements, viewModel) {
    if (!elements.promoEl) return
    // Once an offer applies the headline replaces the "buy more" line.
    const headline = viewModel.status && viewModel.status.headlineText
    elements.promoEl.textContent = headline || viewModel.promoLine
  }

  function paintCard(elements, viewModel) {
    if (elements.cardEl) elements.cardEl.hidden = !viewModel.showCard
  }

  // Status row: what the customer has (left) and the hint, badge or highest
  // discount tick (right). The badge ("Save £0.60") gets its own look.
  function paintStatus(elements, viewModel) {
    const status = viewModel.status
    if (!status) return
    if (elements.statusEl) elements.statusEl.textContent = status.statusText
    if (elements.asideEl) {
      elements.asideEl.textContent = status.badgeText || status.hintText || ''
      elements.asideEl.classList.toggle('sparkly-tier-pricing__aside--badge', !!status.badgeText)
    }
  }

  // Bar: fill up to the dot, a marker per tier number, and the dot showing the
  // current quantity. A marker the dot sits on is hidden under it.
  function paintProgressBar(elements, dot) {
    elements.fillEl.style.width = dot.dotPct + '%'
    elements.markersEl.innerHTML = ''
    dot.markers.forEach((marker) => {
      const el = document.createElement('span')
      el.className = 'sparkly-tier-pricing__marker' +
        (marker.reached ? ' sparkly-tier-pricing__marker--reached' : '') +
        (marker.covered ? ' sparkly-tier-pricing__marker--covered' : '')
      el.style.left = marker.pct + '%'
      el.textContent = String(marker.value)
      elements.markersEl.appendChild(el)
    })
    elements.dotEl.style.left = dot.dotPct + '%'
    elements.dotEl.textContent = String(dot.dotValue)
  }

  // One pill per tier ("8 × £1.63"); the exact-match pill carries a tick and
  // tiers below the applied one are dimmed. A dashed box between two pills
  // shows the quantity that sits between tiers.
  function paintTierButtons(elements, viewModel) {
    elements.tiersEl.innerHTML = ''
    viewModel.tierButtons.forEach((btn, i) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'sparkly-tier-pricing__tier-btn' +
        (btn.active ? ' sparkly-tier-pricing__tier-btn--active' : '') +
        (btn.dimmed ? ' sparkly-tier-pricing__tier-btn--dimmed' : '')
      el.textContent = btn.label
      if (btn.active) {
        const tick = document.createElement('span')
        tick.className = 'sparkly-tier-pricing__tier-tick'
        tick.setAttribute('aria-hidden', 'true')
        tick.textContent = '✓'
        el.appendChild(tick)
      }
      el.addEventListener('click', () => setQuantityInput(btn.minQty))
      elements.tiersEl.appendChild(el)

      if (viewModel.tempBoxAfterIndex === i) {
        const temp = document.createElement('span')
        temp.className = 'sparkly-tier-pricing__temp-btn'
        temp.textContent = viewModel.tempBoxLabel
        elements.tiersEl.appendChild(temp)
      }
    })
  }

  // Skips the destructive rebuild (replays animation, clears focus) when
  // nothing tier-button-related changed since last render — tracked via a
  // signature on tierButtonsSignatureRef, a { value } box the caller owns.
  function paintProgressCard(elements, viewModel, basePrice, addingQty, tierButtonsSignatureRef) {
    if (!viewModel.showCard || !viewModel.progressState) return
    const state = viewModel.progressState

    paintProgressBar(elements, viewModel.dot)

    const signature = computeTierButtonsSignature(state, basePrice, addingQty)
    if (tierButtonsSignatureRef.value === signature) return
    tierButtonsSignatureRef.value = signature
    paintTierButtons(elements, viewModel)
  }

  function paintWidget(elements, viewModel, basePrice, addingQty, tierButtonsSignatureRef) {
    paintPriceRow(elements, viewModel)
    paintPromo(elements, viewModel)
    paintCard(elements, viewModel)
    paintProgressCard(elements, viewModel, basePrice, addingQty, tierButtonsSignatureRef)
    paintStatus(elements, viewModel)
  }

  function paintMixMatchList(listEl, rows) {
    listEl.innerHTML = ''
    rows.forEach((row) => {
      const link = document.createElement('a')
      link.href = row.href
      link.className = 'sparkly-tier-pricing__list-item'

      if (row.imageUrl) {
        const img = document.createElement('img')
        img.src = row.imageUrl
        img.alt = row.title
        img.className = 'sparkly-tier-pricing__list-thumb'
        link.appendChild(img)
      } else {
        const placeholder = document.createElement('span')
        placeholder.className = 'sparkly-tier-pricing__list-thumb sparkly-tier-pricing__list-thumb--placeholder'
        link.appendChild(placeholder)
      }

      const name = document.createElement('span')
      name.className = 'sparkly-tier-pricing__list-name'
      name.textContent = row.title
      link.appendChild(name)

      const qtyLabel = document.createElement('span')
      qtyLabel.className = 'sparkly-tier-pricing__list-qty'
      qtyLabel.textContent = row.qtyLabel
      link.appendChild(qtyLabel)

      listEl.appendChild(link)
    })
  }

  function renderMixMatchList(listEl, products, cartItems) {
    paintMixMatchList(listEl, buildMixMatchRows(products, cartItems))
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

  function queryWidgetElements(container) {
    return {
      priceEl: container.querySelector('[data-tier-pricing-price]'),
      eachLabelEl: container.querySelector('[data-tier-pricing-each-label]'),
      promoEl: container.querySelector('[data-tier-pricing-promo]'),
      cardEl: container.querySelector('[data-tier-pricing-card]'),
      statusEl: container.querySelector('[data-tier-pricing-status]'),
      asideEl: container.querySelector('[data-tier-pricing-aside]'),
      fillEl: container.querySelector('[data-tier-pricing-fill]'),
      markersEl: container.querySelector('[data-tier-pricing-markers]'),
      dotEl: container.querySelector('[data-tier-pricing-dot]'),
      tiersEl: container.querySelector('[data-tier-pricing-tiers]'),
      toggleEl: container.querySelector('[data-tier-pricing-toggle]'),
      listEl: container.querySelector('[data-tier-pricing-list]'),
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
        formatMoney: formatMoneyFn,
      })
      paintWidget(elements, viewModel, basePrice, addingQty, tierButtonsSignatureRef)

      const timeDiscountJson = container.dataset.timeDiscount
      if (timeDiscountJson) {
        updateTimeDiscountDisplay(container, timeDiscountJson, basePrice, variantStateRef.value, formatMoneyFn)
      }

      if (config.isGroup && elements.listEl && !elements.listEl.hidden) {
        renderMixMatchList(elements.listEl, buildDisplayMixMatchItems(config), lastCartItems)
      }
    }

    // Liquid now renders the toggle+list markup unconditionally (see the
    // comment on data-discount above) — isGroup is fixed at metafield-sync
    // time (total member count), not per-variant, so hiding it once here
    // (rather than every render) is correct and matches how paintCard
    // already owns cardEl's hidden state.
    if (elements.toggleEl) elements.toggleEl.hidden = !config.isGroup

    if (elements.toggleEl && elements.listEl && config.isGroup) {
      let open = false
      elements.toggleEl.addEventListener('click', () => {
        open = !open
        elements.listEl.hidden = !open
        elements.toggleEl.textContent = 'mix & match products ' + (open ? '▲' : '▼')
        if (open) renderMixMatchList(elements.listEl, buildDisplayMixMatchItems(config), lastCartItems)
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
