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

function totalAtTier(basePrice, tier) {
  return Math.round(unitPriceAtTier(basePrice, tier) * tier.minQty * 100) / 100
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

function sumGroupQuantityInCart(cartItems, handles) {
  return cartItems
    .filter((item) => handles.includes(item.handle))
    .reduce((sum, item) => sum + item.quantity, 0)
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

  const cartPct = topThreshold > 0 ? Math.min(100, Math.round((otherQty / topThreshold) * 100)) : 0
  const addedPctRaw = topThreshold > 0 ? Math.round((addingQty / topThreshold) * 100) : 0
  const addedPct = clamp(addedPctRaw, 0, 100 - cartPct)
  const rawCalloutPct = topThreshold > 0 ? Math.round((combinedQty / topThreshold) * 100) : 0
  const calloutPct = clamp(rawCalloutPct, 6, 94)
  const maxed = combinedQty >= topThreshold

  const tierButtons = sorted.map((t) => ({ minQty: t.minQty, active: addingQty === t.minQty }))

  // Prices at sorted[i] (the lower, already-crossed boundary), not
  // sorted[i + 1] — matches the design reference (mkV2 in
  // widget-reference.dc.html): the preview uses the rate already unlocked.
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

// Copy formatting — formatMoney is injected as an (n) => string abstraction.

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

// View-model assembly: decides WHAT the widget shows. The DOM layer below
// only paints whatever this returns.

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
      breakdownText: null, // null = leave it alone, distinct from '' = clear it
    }
  }

  const progressState = computeProgressState(tiers, otherQty || 0, addingQty)
  // perUnitPrice, not unitPriceAtTier: this needs the price at the current
  // COMBINED quantity, not at a specific tier's own minQty.
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

// Mix & match product list — pure row-building, then a thin DOM paint.

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
  }

  function paintPromo(elements, viewModel) {
    if (elements.promoEl) elements.promoEl.textContent = viewModel.promoText
  }

  function paintCard(elements, viewModel) {
    if (elements.cardEl) elements.cardEl.hidden = !viewModel.showCard
  }

  function paintBreakdown(elements, viewModel) {
    // null = no discount configured — leave existing text alone (card is hidden anyway).
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

  // Skips the destructive rebuild (replays animation, clears focus) when
  // nothing tier-button-related changed since last render — tracked via a
  // signature on tierButtonsSignatureRef, a { value } box the caller owns.
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

  // DOM: cart access

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
    const standaloneData = JSON.parse(container.dataset.tiers)
    const moneyFormat = JSON.parse(container.dataset.moneyFormat)
    const group = JSON.parse(container.dataset.group)
    const productHandle = JSON.parse(container.dataset.productHandle)
    const tiers = withUnitAnchor(group ? group.tiers : standaloneData.tiers)

    return {
      moneyFormat,
      group,
      productHandle,
      tiers,
      title: group ? group.title : standaloneData.title,
      hasTiers: !!(tiers && tiers.length > 0),
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

  // Builds the render cycle and wires the mix & match toggle (needs the
  // same last-fetched-cart state the render cycle owns). Returns `render`;
  // every other listener is wired from initTierPricing against it.
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
