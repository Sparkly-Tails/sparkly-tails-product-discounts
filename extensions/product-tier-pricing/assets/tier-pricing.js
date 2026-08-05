// extensions/product-tier-pricing/assets/tier-pricing.js
//
// Shopify theme app extension blocks load exactly one JS asset per block
// (declared as a single "javascript" key in the block's schema) — there is
// no bundler and no ES modules here, so this can't be split into separate
// files the way a normal app could be. The section banners below are the
// closest equivalent: each groups a single, cohesive responsibility, in
// dependency order (pure math first, DOM last). Everything above the
// `module.exports` block is pure — no `document`/`window` access, no side
// effects — and is unit tested by ../product-tier-pricing-tests. Everything
// below the `typeof document !== 'undefined'` guard is DOM plumbing; it
// stays intentionally thin, delegating all actual decisions to the pure
// layer above it (see computeWidgetViewModel), which is what makes that
// DOM code safe to keep untested — it has almost nothing left to get wrong.

// ===========================================================================
// Shared pure helpers
// ===========================================================================

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function sortTiersByMinQty(tiers) {
  return tiers.slice().sort((a, b) => a.minQty - b.minQty)
}

// Fills in a tier's percentOff/anchorPrice/fixedPrice with the defaults
// pricing math expects (0 / null / null) whenever a merchant left them
// unset. Used only where a concrete NUMBER is required for a price
// calculation — computeTierState's "remainingTiers"/"nextTier" preview
// objects deliberately pass percentOff through raw (undefined stays
// undefined) since those describe a tier that hasn't been applied yet,
// not a price being computed right now.
function normalizeTierPricing(tier) {
  return {
    percentOff: tier.percentOff != null ? tier.percentOff : 0,
    anchorPrice: tier.anchorPrice != null ? tier.anchorPrice : null,
    fixedPrice: tier.fixedPrice != null ? tier.fixedPrice : null,
  }
}

// Renders a money amount using this shop's money_format template, e.g.
// "£{{amount}}". Pure string work — no DOM involved — so it lives here
// rather than in the browser-only section below, and every formatting
// decision elsewhere in this file goes through this one function.
function formatMoney(amount, format) {
  const withDecimals = amount.toFixed(2)
  return format.replace(/\{\{\s*amount\s*\}\}/, withDecimals)
}

// ===========================================================================
// Tier pricing math
// ===========================================================================

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

// Each strategy either prices the unit or returns null ("not applicable,
// try the next one"). Precedence is fixed price, then an anchored blend,
// then plain percentage off — adding a new pricing mode in the future means
// adding a new strategy here, not editing these three (open for extension,
// closed for modification).
const PRICING_STRATEGIES = [
  // Fixed price wins outright, clamped so it can never read as a markup.
  (basePrice, quantity, state) => (state.fixedPrice != null ? clamp(state.fixedPrice, 0, basePrice) : null),
  // Anchored discount: a flat price for the tier's first minQty units, then
  // percentOff on every unit beyond that, blended back into a per-unit rate.
  (basePrice, quantity, state) => {
    if (state.anchorPrice == null) return null
    const extraUnits = quantity - state.minQty
    const totalPaid = state.anchorPrice + extraUnits * basePrice * (1 - state.percentOff / 100)
    return clamp(totalPaid, 0, basePrice * quantity) / quantity
  },
  // Plain percentage off — the default when neither of the above applies.
  (basePrice, quantity, state) => basePrice * (1 - state.percentOff / 100),
]

function perUnitPrice(basePrice, quantity, state) {
  for (const strategy of PRICING_STRATEGIES) {
    const price = strategy(basePrice, quantity, state)
    if (price != null) return price
  }
  return basePrice // unreachable — the plain-percent strategy always matches — kept explicit rather than implicit.
}

function unitPriceAtTier(basePrice, tier) {
  return perUnitPrice(basePrice, tier.minQty, { ...normalizeTierPricing(tier), minQty: tier.minQty })
}

function totalAtTier(basePrice, tier) {
  return Math.round(unitPriceAtTier(basePrice, tier) * tier.minQty * 100) / 100
}

// Prepends a synthetic { minQty: 1, percentOff: 0 } tier when the config
// doesn't already define one at quantity 1, so the tier-button row always
// has a "1 x <base price>" anchor button and the dashed temp-box mechanism
// covers the 2..first-tier-1 range too (previously that gap never rendered
// a temp box, since the loop below needs at least two entries to bracket
// a quantity between). Price-neutral: a 0%-off tier reached below any real
// discount computes to the same base price computeTierState already
// returns when no tier is reached at all.
function withUnitAnchor(tiers) {
  if (!tiers || tiers.length === 0) return tiers
  if (tiers.some((t) => t.minQty === 1)) return tiers
  return [{ minQty: 1, percentOff: 0 }].concat(tiers)
}

// ===========================================================================
// Cart math
// ===========================================================================

function sumGroupQuantityInCart(cartItems, handles) {
  return cartItems
    .filter((item) => handles.includes(item.handle))
    .reduce((sum, item) => sum + item.quantity, 0)
}

// Converts a TRUE, already-in-cart quantity (summed across every product
// that counts toward this discount, INCLUDING this exact product) into the
// `otherQty` value computeProgressState expects. The on-page quantity
// stepper has an inherent floor of 1 (Shopify's native minimum-purchase-
// quantity convention, never 0), so passing the true cart total straight
// through would overcount by 1 the instant the page loads — the stepper
// resting at its floor isn't "one extra unit being added", it's just the
// widget's baseline state. Subtracting 1 cancels that floor, so combinedQty
// (= otherQty + addingQty) lands exactly on the true cart total when the
// stepper is at rest, and tracks it 1-for-1 as the stepper moves up or
// down — the stepper's own floor of 1 then naturally enforces "combined
// quantity can never read below the true cart total" with no extra
// clamping needed anywhere else. Clamped at 0 for the common empty-cart
// case, where a naive subtraction would otherwise go negative.
function cartBaselineOtherQty(trueCartQty) {
  return Math.max(0, trueCartQty - 1)
}

// ===========================================================================
// Progress/derived state
// ===========================================================================

function computeProgressState(tiers, otherQty, addingQty) {
  const sorted = sortTiersByMinQty(tiers)
  const topThreshold = sorted[sorted.length - 1].minQty
  const combinedQty = otherQty + addingQty
  const tierState = computeTierState(sorted, combinedQty)

  const cartPct = topThreshold > 0 ? Math.min(100, Math.round((otherQty / topThreshold) * 100)) : 0
  const addedPctRaw = topThreshold > 0 ? Math.round((addingQty / topThreshold) * 100) : 0
  const addedPct = clamp(addedPctRaw, 0, 100 - cartPct)
  const rawCalloutPct = topThreshold > 0 ? Math.round((combinedQty / topThreshold) * 100) : 0
  const calloutPct = clamp(rawCalloutPct, 6, 94)
  const maxed = combinedQty >= topThreshold

  const tierButtons = sorted.map((t) => ({ minQty: t.minQty, active: addingQty === t.minQty }))

  // The dashed box previews the running total AT THE RATE ALREADY IN EFFECT
  // for this in-between quantity — i.e. sorted[i], the lower/just-crossed
  // boundary — not sorted[i + 1] (the not-yet-reached tier above it). This
  // matches the design reference (mkV2 in widget-reference.dc.html): zone 1
  // (qty strictly between the qty:1 anchor and the first real tier) prices
  // at plain base rate, and each zone above prices at whichever tier's
  // threshold the quantity has already passed.
  let tempBox = null
  for (let i = 0; i < sorted.length - 1; i++) {
    if (addingQty > sorted[i].minQty && addingQty < sorted[i + 1].minQty) {
      tempBox = { afterIndex: i, tier: sorted[i] }
      break
    }
  }

  return { combinedQty, topThreshold, cartPct, addedPct, calloutPct, maxed, tierState, tierButtons, tempBox }
}

function computeTierButtonsSignature(state, basePrice, addingQty) {
  return JSON.stringify(state.tierButtons) + '|' +
    (state.tempBox ? state.tempBox.afterIndex + ':' + state.tempBox.tier.minQty : 'none') +
    '|' + addingQty + '|' + basePrice
}

// ===========================================================================
// Copy formatting (formatMoney is injected — an (n) => string function —
// so this section depends only on that small abstraction, never on how
// money actually gets formatted; see createMoneyFormatter below).
// ===========================================================================

function formatCalloutText(progressState, tiers, basePrice, formatMoneyFn) {
  if (progressState.maxed) {
    const sorted = sortTiersByMinQty(tiers)
    const topTier = sorted[sorted.length - 1]
    return progressState.combinedQty + ' combined · ' + formatMoneyFn(unitPriceAtTier(basePrice, topTier)) + ' each'
  }
  const ts = progressState.tierState
  const next = ts.nextTier || (ts.remainingTiers && ts.remainingTiers[0])
  return progressState.combinedQty + ' of ' + next.minQty + ' · ' + next.delta + ' more for ' + formatMoneyFn(
    unitPriceAtTier(basePrice, next),
  )
}

function formatTempBoxLabel(progressState, basePrice, addingQty, formatMoneyFn) {
  if (!progressState.tempBox) return ''
  const total = Math.round(unitPriceAtTier(basePrice, progressState.tempBox.tier) * addingQty * 100) / 100
  return addingQty + 'x ' + formatMoneyFn(total)
}

function computeOrderSummary(basePrice, addingQty, unitPrice) {
  const total = Math.round(unitPrice * addingQty * 100) / 100
  const fullPrice = Math.round(basePrice * addingQty * 100) / 100
  const savings = Math.round((fullPrice - total) * 100) / 100
  return { total, fullPrice, savings }
}

function buildPromoText(tiers, basePrice, formatMoneyFn, isGroup, title) {
  const sorted = sortTiersByMinQty(tiers)
  const clauses = sorted.slice(1).map((t) => t.minQty + '+ unlocks ' + formatMoneyFn(unitPriceAtTier(basePrice, t)) + ' each')
  const hasTitle = title != null && title !== ''
  const prefix = isGroup
    ? (hasTitle ? 'Mix & match any ' + title + ' — ' : 'Mix & match — ')
    : (hasTitle ? 'Buy more ' + title + ' — ' : 'Buy more, save more — ')
  return prefix + clauses.join(', ')
}

// ===========================================================================
// View-model assembly — the single place that decides WHAT the widget
// should say, for any combination of inputs. Pure and fully unit tested:
// this is what used to be smeared across the DOM-touching renderTierPricing
// and renderProgressCard functions, untestable because it was entangled
// with container.querySelector calls. The DOM layer at the bottom of this
// file now does nothing but paint whatever this function returns.
// ===========================================================================

function computeWidgetViewModel({ tiers, basePrice, otherQty, addingQty, title, isGroup, formatMoney: formatMoneyFn }) {
  const plainPrice = formatMoneyFn(basePrice)

  if (!tiers || tiers.length === 0) {
    return {
      showCard: false,
      discountedPrice: null,
      plainPrice,
      promoText: '',
      progressState: null,
      calloutText: '',
      scaleLabels: [],
      tierButtons: [],
      tempBoxLabel: null,
      tempBoxAfterIndex: null,
      breakdownText: null, // null = "leave it alone", distinct from '' = "clear it"
    }
  }

  const progressState = computeProgressState(tiers, otherQty || 0, addingQty)
  // The price-per-unit AT THE CURRENT COMBINED QUANTITY (which may sit
  // anywhere within the reached tier's range, not just at its own minQty)
  // — perUnitPrice, not unitPriceAtTier, which answers a different question
  // ("price at a SPECIFIC tier's own minQty", used for tier buttons/labels
  // below) that would silently mis-price anchor tiers here.
  const unit = perUnitPrice(basePrice, progressState.combinedQty, progressState.tierState)
  const isDiscounted = progressState.tierState.fixedPrice != null || progressState.tierState.percentOff > 0

  const sortedTiers = sortTiersByMinQty(tiers)
  const scaleLabels = ['0'].concat(
    sortedTiers.slice(1).map((t) => t.minQty + ' · ' + formatMoneyFn(unitPriceAtTier(basePrice, t)) + ' ea'),
  )
  const tierButtons = progressState.tierButtons.map((btn, i) => ({
    minQty: btn.minQty,
    active: btn.active,
    label: btn.minQty + ' x ' + formatMoneyFn(totalAtTier(basePrice, sortedTiers[i])),
  }))

  const summary = computeOrderSummary(basePrice, addingQty, unit)
  const unitLabel = addingQty === 1 ? ' unit' : ' units'
  let breakdownText = addingQty + unitLabel + ' × ' + formatMoneyFn(unit)
  if (summary.savings > 0) {
    breakdownText += ' · full price ' + formatMoneyFn(summary.fullPrice) + ' — you save ' + formatMoneyFn(summary.savings)
  }

  return {
    showCard: true,
    discountedPrice: isDiscounted ? formatMoneyFn(unit) : null,
    plainPrice,
    promoText: tiers.length > 1 ? buildPromoText(tiers, basePrice, formatMoneyFn, isGroup, title) : '',
    progressState,
    calloutText: formatCalloutText(progressState, tiers, basePrice, formatMoneyFn),
    scaleLabels,
    tierButtons,
    tempBoxLabel: progressState.tempBox ? formatTempBoxLabel(progressState, basePrice, addingQty, formatMoneyFn) : null,
    tempBoxAfterIndex: progressState.tempBox ? progressState.tempBox.afterIndex : null,
    breakdownText,
  }
}

// ===========================================================================
// Mix & match product list — pure row-building, then a thin DOM paint.
// ===========================================================================

function buildMixMatchRows(products, cartItems) {
  return products.map((product) => {
    const qty = sumGroupQuantityInCart(cartItems || [], [product.handle])
    return {
      href: '/products/' + product.handle,
      title: product.title,
      imageUrl: product.imageUrl || null,
      qtyLabel: qty === 1 ? '1 in cart' : qty + ' in cart',
    }
  })
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    clamp,
    sortTiersByMinQty,
    normalizeTierPricing,
    formatMoney,
    computeTierState,
    perUnitPrice,
    sumGroupQuantityInCart,
    unitPriceAtTier,
    totalAtTier,
    computeProgressState,
    formatCalloutText,
    formatTempBoxLabel,
    buildPromoText,
    computeOrderSummary,
    computeTierButtonsSignature,
    withUnitAnchor,
    cartBaselineOtherQty,
    computeWidgetViewModel,
    buildMixMatchRows,
  }
}

// ===========================================================================
// DOM: element painting — each function's only job is copying view-model
// fields onto the page. No calculation happens below this line.
// ===========================================================================

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
  }

  function paintPromo(elements, viewModel) {
    if (elements.promoEl) elements.promoEl.textContent = viewModel.promoText
  }

  function paintCard(elements, viewModel) {
    if (elements.cardEl) elements.cardEl.hidden = !viewModel.showCard
  }

  function paintBreakdown(elements, viewModel) {
    // null means "no discount configured at all" — leave whatever text was
    // there before untouched (matches the pre-refactor early-return, and
    // the card sits hidden in that state anyway).
    if (elements.breakdownEl && viewModel.breakdownText != null) {
      elements.breakdownEl.textContent = viewModel.breakdownText
    }
  }

  function paintScale(elements, viewModel) {
    elements.scaleEl.innerHTML = ''
    viewModel.scaleLabels.forEach((text) => {
      const label = document.createElement('span')
      label.textContent = text
      elements.scaleEl.appendChild(label)
    })
  }

  function paintTierButtons(elements, viewModel) {
    elements.tiersEl.innerHTML = ''
    viewModel.tierButtons.forEach((btn, i) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'sparkly-tier-pricing__tier-btn' + (btn.active ? ' sparkly-tier-pricing__tier-btn--active' : '')
      el.textContent = btn.label
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

  // Rebuilding tier buttons + the dashed temp-box is destructive: it
  // replays the temp-box's fade/scale-in animation and clears any focus
  // the customer has placed on a tier button. This runs on every render
  // (including the 1s cart-aware poll), so it's skipped entirely when
  // nothing that affects it has changed since last time — tracked via a
  // signature stashed on tierButtonsSignatureRef, a `{ value }` box the
  // caller owns so it survives across renders. `null` never equals a real
  // signature, so the very first render always paints the buttons.
  function paintProgressCard(elements, viewModel, basePrice, addingQty, tierButtonsSignatureRef) {
    if (!viewModel.showCard || !viewModel.progressState) return
    const state = viewModel.progressState

    elements.calloutEl.textContent = viewModel.calloutText
    elements.calloutEl.style.left = state.calloutPct + '%'
    elements.tickEl.style.left = state.calloutPct + '%'
    elements.dotEl.style.left = state.calloutPct + '%'
    elements.cartSegmentEl.style.width = state.cartPct + '%'
    elements.addingSegmentEl.style.width = state.addedPct + '%'

    paintScale(elements, viewModel)

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
    paintBreakdown(elements, viewModel)
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

  // ===========================================================================
  // DOM: cart access
  // ===========================================================================

  async function fetchCart() {
    const res = await fetch('/cart.js')
    return res.json()
  }

  async function fetchGroupCartState(allDiscountHandles, productHandle) {
    const cart = await fetchCart()
    const trueCartQty = sumGroupQuantityInCart(cart.items, allDiscountHandles)
    return {
      otherQty: cartBaselineOtherQty(trueCartQty),
      selfQty: sumGroupQuantityInCart(cart.items, [productHandle]),
      cartItems: cart.items,
    }
  }

  // Detects "a real Add to Cart just succeeded" (this product's cart
  // quantity went up since the last check) and resets the stepper back to
  // its floor of 1 — confirmed live that this theme's native stepper does
  // NOT do this itself; it stays at whatever was last submitted. Without
  // this, the next render would double-count: the just-added units are now
  // part of the freshly-fetched otherQty AND still sitting in the stale
  // addingQty. lastKnownSelfQtyRef.value starts at null (not 0), so the
  // very first render never fires a false reset.
  function resetStepperIfJustAdded(lastKnownSelfQtyRef, selfQtyNow) {
    if (lastKnownSelfQtyRef.value != null && selfQtyNow > lastKnownSelfQtyRef.value) {
      setQuantityInput(1)
    }
    lastKnownSelfQtyRef.value = selfQtyNow
  }

  // ===========================================================================
  // DOM: per-widget setup — config parsing, element lookup, and the
  // render-cycle factory. Each does exactly one job; initTierPricing at the
  // bottom of this file just calls them in order.
  // ===========================================================================

  function parseWidgetConfig(container) {
    const standaloneData = JSON.parse(container.dataset.tiers)
    const moneyFormat = JSON.parse(container.dataset.moneyFormat)
    const group = JSON.parse(container.dataset.group)
    const productHandle = JSON.parse(container.dataset.productHandle)
    // withUnitAnchor adds the "buy 1 at base price" tier the merchandiser
    // never has to configure explicitly — see its definition for why this
    // is price-neutral and only affects the button row / temp-box range.
    const tiers = withUnitAnchor(group ? group.tiers : standaloneData.tiers)

    return {
      moneyFormat,
      group,
      productHandle,
      tiers,
      title: group ? group.title : standaloneData.title,
      hasTiers: !!(tiers && tiers.length > 0),
      // Every handle that counts toward this discount's combined quantity —
      // this product itself plus, in group mode, its siblings. Standalone
      // mode is just the one-element case of the same formula.
      allDiscountHandles: group ? [productHandle].concat(group.siblings.map((s) => s.handle)) : [productHandle],
      mixMatchListItems: group ? [group.self].concat(group.siblings) : [],
    }
  }

  function queryWidgetElements(container) {
    return {
      priceEl: container.querySelector('[data-tier-pricing-price]'),
      promoEl: container.querySelector('[data-tier-pricing-promo]'),
      cardEl: container.querySelector('[data-tier-pricing-card]'),
      breakdownEl: container.querySelector('[data-tier-pricing-breakdown]'),
      calloutEl: container.querySelector('[data-tier-pricing-callout]'),
      tickEl: container.querySelector('[data-tier-pricing-tick]'),
      cartSegmentEl: container.querySelector('[data-tier-pricing-cart-segment]'),
      addingSegmentEl: container.querySelector('[data-tier-pricing-adding-segment]'),
      dotEl: container.querySelector('[data-tier-pricing-dot]'),
      scaleEl: container.querySelector('[data-tier-pricing-scale]'),
      tiersEl: container.querySelector('[data-tier-pricing-tiers]'),
      toggleEl: container.querySelector('[data-tier-pricing-toggle]'),
      listEl: container.querySelector('[data-tier-pricing-list]'),
    }
  }

  // Builds the render cycle for one widget instance and wires the mix &
  // match toggle (which needs read access to the same last-fetched-cart
  // state the render cycle owns, so it stays here rather than becoming a
  // separately-exposed function). Returns `render`; every other event
  // listener (quantity stepper, Add to Cart, variant change, polling) is
  // wired from initTierPricing against that single returned function.
  function createRenderer(container, config, elements) {
    const tierButtonsSignatureRef = { value: null }
    const lastKnownSelfQtyRef = { value: null }
    const formatMoneyFn = createMoneyFormatter(config.moneyFormat)
    let lastCartItems = []

    async function render() {
      const basePrice = Number(container.dataset.basePrice)
      const quantityInput = document.querySelector('input[name="quantity"]')
      const addingQty = quantityInput ? Number(quantityInput.value) || 1 : 1

      let otherQty = 0
      // No discount configured at all: skip the cart fetch entirely rather
      // than doing it on every quantity change/poll tick for the common
      // undiscounted-product case — computeWidgetViewModel's own
      // !tiers.length branch handles the resulting plain-price display.
      if (config.hasTiers) {
        try {
          const cartState = await fetchGroupCartState(config.allDiscountHandles, config.productHandle)
          lastCartItems = cartState.cartItems
          otherQty = cartState.otherQty
          resetStepperIfJustAdded(lastKnownSelfQtyRef, cartState.selfQty)
        } catch {
          otherQty = 0
        }
      }

      const viewModel = computeWidgetViewModel({
        tiers: config.tiers,
        basePrice,
        otherQty,
        addingQty,
        title: config.title,
        isGroup: !!config.group,
        formatMoney: formatMoneyFn,
      })
      paintWidget(elements, viewModel, basePrice, addingQty, tierButtonsSignatureRef)

      if (config.group && elements.listEl && !elements.listEl.hidden) {
        renderMixMatchList(elements.listEl, config.mixMatchListItems, lastCartItems)
      }
    }

    if (elements.toggleEl && elements.listEl && config.group) {
      let open = false
      elements.toggleEl.addEventListener('click', () => {
        open = !open
        elements.listEl.hidden = !open
        elements.toggleEl.textContent = 'mix & match products ' + (open ? '▲' : '▼')
        if (open) renderMixMatchList(elements.listEl, config.mixMatchListItems, lastCartItems)
      })
    }

    return render
  }

  // ===========================================================================
  // DOM: event wiring — each function attaches exactly one behavior to the
  // page and calls `render` when something changes. None of them decide
  // what render should show; that's the view-model layer's job.
  // ===========================================================================

  function wireQuantityStepper(render) {
    const quantityInput = document.querySelector('input[name="quantity"]')
    if (!quantityInput) return

    quantityInput.addEventListener('input', render)
    quantityInput.addEventListener('change', render)

    // This theme's +/- stepper buttons set the input's value
    // programmatically without dispatching input/change on it, so we hook
    // the buttons' own click events directly instead of polling for a
    // value change. Scoped to this quantity widget (not document-wide)
    // since the cart drawer's own per-line steppers use the same
    // aria-labels. Deferred one tick so we read the value after the
    // theme's own click handler has updated it.
    const quantityScope = quantityInput.closest('product-quantity') || quantityInput.closest('form') || document
    quantityScope.querySelectorAll('button[aria-label="Increase quantity"], button[aria-label="Decrease quantity"]').forEach((btn) => {
      btn.addEventListener('click', () => setTimeout(render, 0))
    })
  }

  function wireAddToCartForm(render) {
    const addToCartForm = document.querySelector('form[action*="/cart/add"]')
    if (!addToCartForm) return

    // Best-effort immediate re-check after a real submission, so the
    // price/progress bar (and the post-add stepper reset) don't wait for
    // the next poll tick. If /cart/add.js hasn't finished yet this briefly
    // under-counts, never over-counts, and self-corrects on the next poll
    // or visibilitychange.
    addToCartForm.addEventListener('submit', () => render())
  }

  function wireVariantChange(container, render) {
    const productVariantsEl = document.querySelector('product-variants')
    if (!productVariantsEl) return

    productVariantsEl.addEventListener('VARIANT_CHANGE', (event) => {
      const variant = event.target.currentVariant
      if (variant && typeof variant.price === 'number') {
        container.dataset.basePrice = String(variant.price / 100)
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

  // Not just group mode: a standalone-discounted product's own
  // cart-resident quantity can also change from elsewhere (cart drawer,
  // another tab) while this page sits open, and the widget needs to
  // notice without a reload.
  function wireCartAwarePolling(render) {
    setInterval(render, 1000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') render()
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
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTierPricing)
  } else {
    initTierPricing()
  }
}
