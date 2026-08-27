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

// Evenly-spaced scale points for the progress track: always starts at 0
// (the synthetic qty:1 anchor tier reads as "0" here, same convention
// buildPromoText/tierButtons already use), followed by each real tier's
// minQty. Spacing is even regardless of the value gaps between tiers —
// matching the fixed circle layout — so combinedQty's fill position is
// interpolated within whichever even-width segment it currently falls in,
// not scaled linearly across the whole 0..topThreshold range.
function computeProgressTrack(sortedTiers, combinedQty) {
  const values = [0].concat(sortedTiers.slice(1).map((t) => t.minQty))
  const stops = values.map((value) => ({ value, active: combinedQty >= value }))

  const n = values.length
  const step = n > 1 ? 100 / (n - 1) : 100
  let fillPct = 100
  for (let i = 0; i < n - 1; i++) {
    if (combinedQty <= values[i + 1]) {
      const span = values[i + 1] - values[i]
      const frac = span > 0 ? (combinedQty - values[i]) / span : 1
      fillPct = Math.round(clamp(i * step + frac * step, 0, 100))
      break
    }
  }

  return { stops, fillPct }
}

// Progress/derived state

function computeProgressState(tiers, otherQty, addingQty) {
  const sorted = sortTiersByMinQty(tiers)
  const topThreshold = sorted[sorted.length - 1].minQty
  const combinedQty = otherQty + addingQty
  const tierState = computeTierState(sorted, combinedQty)
  const maxed = combinedQty >= topThreshold
  const track = computeProgressTrack(sorted, combinedQty)

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

  return { combinedQty, topThreshold, maxed, tierState, tierButtons, tempBox, stops: track.stops, fillPct: track.fillPct }
}

function computeTierButtonsSignature(state, basePrice, addingQty) {
  return JSON.stringify(state.tierButtons) + '|' +
    (state.tempBox ? state.tempBox.afterIndex + ':' + state.tempBox.tier.minQty : 'none') +
    '|' + addingQty + '|' + basePrice
}

// Copy formatting — formatMoney is injected as an (n) => string abstraction.

// Naive English pluralization for a discount's title: append "s" unless it
// already reads as plural, or the customer only has exactly one. Necessary
// because real configured titles mix conventions — "Canagan Cat Soup"
// (singular) vs "Canagan Wet Cat Tins" (already plural) — so blindly
// appending "s" would double-pluralize the latter into "Tinss".
function pluralizeTitle(title, qty) {
  if (qty === 1 || /s$/i.test(title)) return title
  return title + 's'
}

// Below-tier breakdown copy: states how many of the named discount are
// already in the cart and how many more to add to unlock the next tier's
// price (whether that's the first tier or a later one — either way it's
// "the next tier ahead"). Only makes sense before the top tier is reached —
// once maxed, there's no "more" to add, so computeWidgetViewModel falls
// back to the addingQty/savings line instead.
function formatAddMoreText(progressState, tiers, basePrice, formatMoneyFn, title) {
  const ts = progressState.tierState
  const next = ts.nextTier || (ts.remainingTiers && ts.remainingTiers[0])
  const hasTitle = title != null && title !== ''
  const nextPrice = formatMoneyFn(unitPriceAtTier(basePrice, next))
  if (!hasTitle) {
    return 'Add ' + next.delta + ' more to get them for ' + nextPrice
  }
  const qty = progressState.combinedQty
  return 'You have ' + qty + ' ' + pluralizeTitle(title, qty) + ', add ' + next.delta + ' to get them for ' + nextPrice
}

function formatTempBoxLabel(progressState, basePrice, formatMoneyFn) {
  if (!progressState.tempBox) return ''
  const qty = progressState.combinedQty
  const total = Math.round(unitPriceAtTier(basePrice, progressState.tempBox.tier) * qty * 100) / 100
  return qty + 'x ' + formatMoneyFn(total)
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

function computeWidgetViewModel({ tiers, basePrice, compareAtPrice, otherQty, addingQty, title, isGroup, formatMoney: formatMoneyFn }) {
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
      promoText: '',
      progressState: null,
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
  if (!progressState.maxed) {
    breakdownText = formatAddMoreText(progressState, tiers, basePrice, formatMoneyFn, title)
  }

  return {
    showCard: true,
    discountedPrice: isDiscounted ? formatMoneyFn(unit) : null,
    plainPrice,
    promoText: tiers.length > 1 ? buildPromoText(tiers, basePrice, formatMoneyFn, isGroup, title) : '',
    progressState,
    tierButtons,
    tempBoxLabel: progressState.tempBox ? formatTempBoxLabel(progressState, basePrice, formatMoneyFn) : null,
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
    computeProgressTrack,
    pluralizeTitle,
    formatAddMoreText,
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
    // "each" only makes sense once there's a per-unit/bulk-pricing story to
    // explain — showCard already means "this product has a discount
    // configured", the same condition that should hide it.
    if (elements.eachLabelEl) elements.eachLabelEl.hidden = !viewModel.showCard
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

  function paintProgressStops(elements, stops) {
    elements.stopsEl.innerHTML = ''
    stops.forEach((stop) => {
      const el = document.createElement('span')
      el.className = 'sparkly-tier-pricing__stop' + (stop.active ? ' sparkly-tier-pricing__stop--active' : '')
      el.textContent = String(stop.value)
      elements.stopsEl.appendChild(el)
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

    elements.fillEl.style.width = state.fillPct + '%'
    paintProgressStops(elements, state.stops)

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
      eachLabelEl: container.querySelector('[data-tier-pricing-each-label]'),
      promoEl: container.querySelector('[data-tier-pricing-promo]'),
      cardEl: container.querySelector('[data-tier-pricing-card]'),
      breakdownEl: container.querySelector('[data-tier-pricing-breakdown]'),
      fillEl: container.querySelector('[data-tier-pricing-fill]'),
      stopsEl: container.querySelector('[data-tier-pricing-stops]'),
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
      const compareAtPrice = Number(container.dataset.compareAtPrice) || 0
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
        compareAtPrice,
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
