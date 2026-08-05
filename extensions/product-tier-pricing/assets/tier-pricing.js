function computeTierState(tiers, quantity) {
  const sorted = tiers.slice().sort((a, b) => a.minQty - b.minQty)
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
  const percentOff = reachedTier.percentOff != null ? reachedTier.percentOff : 0
  const anchorPrice = reachedTier.anchorPrice != null ? reachedTier.anchorPrice : null
  const fixedPrice = reachedTier.fixedPrice != null ? reachedTier.fixedPrice : null

  if (notReached.length === 0) {
    return { percentOff, anchorPrice, fixedPrice, minQty: reachedTier.minQty, nextTier: null, remainingTiers: null }
  }

  const next = notReached[0]
  return {
    percentOff,
    anchorPrice,
    fixedPrice,
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

function perUnitPrice(basePrice, quantity, state) {
  if (state.fixedPrice != null) {
    return Math.min(Math.max(state.fixedPrice, 0), basePrice)
  }
  if (state.anchorPrice == null) {
    return basePrice * (1 - state.percentOff / 100)
  }
  const extraUnits = quantity - state.minQty
  const totalPaid = state.anchorPrice + extraUnits * basePrice * (1 - state.percentOff / 100)
  const fullPrice = basePrice * quantity
  const clampedTotalPaid = Math.min(Math.max(totalPaid, 0), fullPrice)
  return clampedTotalPaid / quantity
}

function sumGroupQuantityInCart(cartItems, handles) {
  return cartItems
    .filter((item) => handles.includes(item.handle))
    .reduce((sum, item) => sum + item.quantity, 0)
}

function unitPriceAtTier(basePrice, tier) {
  if (tier.fixedPrice != null) {
    return Math.min(Math.max(tier.fixedPrice, 0), basePrice)
  }
  return perUnitPrice(basePrice, tier.minQty, {
    percentOff: tier.percentOff != null ? tier.percentOff : 0,
    anchorPrice: tier.anchorPrice != null ? tier.anchorPrice : null,
    fixedPrice: null,
    minQty: tier.minQty,
  })
}

function totalAtTier(basePrice, tier) {
  return Math.round(unitPriceAtTier(basePrice, tier) * tier.minQty * 100) / 100
}

function computeProgressState(tiers, otherQty, addingQty) {
  const sorted = tiers.slice().sort((a, b) => a.minQty - b.minQty)
  const topThreshold = sorted[sorted.length - 1].minQty
  const combinedQty = otherQty + addingQty
  const tierState = computeTierState(sorted, combinedQty)

  const cartPct = topThreshold > 0 ? Math.min(100, Math.round((otherQty / topThreshold) * 100)) : 0
  const addedPctRaw = topThreshold > 0 ? Math.round((addingQty / topThreshold) * 100) : 0
  const addedPct = Math.max(0, Math.min(100 - cartPct, addedPctRaw))
  const rawCalloutPct = topThreshold > 0 ? Math.round((combinedQty / topThreshold) * 100) : 0
  const calloutPct = Math.max(6, Math.min(94, rawCalloutPct))
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

// Prepends a synthetic { minQty: 1, percentOff: 0 } tier when the config
// doesn't already define one at quantity 1, so the tier-button row always
// has a "1 x <base price>" anchor button and the dashed temp-box mechanism
// covers the 2..first-tier-1 range too (previously that gap never rendered
// a temp box, since the loop above needs at least two entries to bracket
// a quantity between). Price-neutral: a 0%-off tier reached below any real
// discount computes to the same base price computeTierState already
// returns when no tier is reached at all.
function withUnitAnchor(tiers) {
  if (!tiers || tiers.length === 0) return tiers
  if (tiers.some((t) => t.minQty === 1)) return tiers
  return [{ minQty: 1, percentOff: 0 }].concat(tiers)
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

function formatCalloutText(progressState, tiers, basePrice, formatMoney) {
  if (progressState.maxed) {
    const topTier = tiers.slice().sort((a, b) => a.minQty - b.minQty).pop()
    return progressState.combinedQty + ' combined · ' + formatMoney(unitPriceAtTier(basePrice, topTier)) + ' each'
  }
  const ts = progressState.tierState
  const next = ts.nextTier || (ts.remainingTiers && ts.remainingTiers[0])
  return progressState.combinedQty + ' of ' + next.minQty + ' · ' + next.delta + ' more for ' + formatMoney(
    unitPriceAtTier(basePrice, next),
  )
}

function formatTempBoxLabel(progressState, basePrice, addingQty, formatMoney) {
  if (!progressState.tempBox) return ''
  const total = Math.round(unitPriceAtTier(basePrice, progressState.tempBox.tier) * addingQty * 100) / 100
  return addingQty + 'x ' + formatMoney(total)
}

function computeOrderSummary(basePrice, addingQty, unitPrice) {
  const total = Math.round(unitPrice * addingQty * 100) / 100
  const fullPrice = Math.round(basePrice * addingQty * 100) / 100
  const savings = Math.round((fullPrice - total) * 100) / 100
  return { total, fullPrice, savings }
}

function buildPromoText(tiers, basePrice, formatMoney, isGroup, title) {
  const sorted = tiers.slice().sort((a, b) => a.minQty - b.minQty)
  const clauses = sorted.slice(1).map((t) => t.minQty + '+ unlocks ' + formatMoney(unitPriceAtTier(basePrice, t)) + ' each')
  const hasTitle = title != null && title !== ''
  const prefix = isGroup
    ? (hasTitle ? 'Mix & match any ' + title + ' — ' : 'Mix & match — ')
    : (hasTitle ? 'Buy more ' + title + ' — ' : 'Buy more, save more — ')
  return prefix + clauses.join(', ')
}

function computeTierButtonsSignature(state, basePrice, addingQty) {
  return JSON.stringify(state.tierButtons) + '|' +
    (state.tempBox ? state.tempBox.afterIndex + ':' + state.tempBox.tier.minQty : 'none') +
    '|' + addingQty + '|' + basePrice
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
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
  }
}

if (typeof document !== 'undefined') {
  function formatMoney(amount, format) {
    const withDecimals = amount.toFixed(2)
    return format.replace(/\{\{\s*amount\s*\}\}/, withDecimals)
  }

  function renderTierPricing(container, tiers, moneyFormat, otherQty, title, isGroup, tierButtonsSignatureRef) {
    const priceEl = container.querySelector('[data-tier-pricing-price]')
    const promoEl = container.querySelector('[data-tier-pricing-promo]')
    const cardEl = container.querySelector('[data-tier-pricing-card]')
    const basePrice = Number(container.dataset.basePrice)
    const quantityInput = document.querySelector('input[name="quantity"]')
    const addingQty = quantityInput ? Number(quantityInput.value) || 1 : 1

    if (!tiers || tiers.length === 0) {
      priceEl.textContent = formatMoney(basePrice, moneyFormat)
      if (cardEl) cardEl.hidden = true
      if (promoEl) promoEl.textContent = ''
      return
    }

    const state = computeProgressState(tiers, otherQty || 0, addingQty)
    // The price-per-unit AT THE CURRENT COMBINED QUANTITY (which may sit
    // anywhere within the reached tier's range, not just at its own
    // minQty) — reuse the existing perUnitPrice exactly as the standalone
    // path always has, rather than unitPriceAtTier (Task 1), which is for
    // "price at a SPECIFIC tier's own minQty" (tier buttons/labels), a
    // different question that would silently mis-price anchor tiers here.
    const unit = perUnitPrice(basePrice, state.combinedQty, state.tierState)
    const isDiscounted = state.tierState.fixedPrice != null || state.tierState.percentOff > 0

    if (isDiscounted) {
      priceEl.innerHTML = formatMoney(unit, moneyFormat) + ' <s>' + formatMoney(basePrice, moneyFormat) + '</s>'
    } else {
      priceEl.textContent = formatMoney(basePrice, moneyFormat)
    }

    if (promoEl) {
      promoEl.textContent = tiers.length > 1 ? buildPromoText(tiers, basePrice, (n) => formatMoney(n, moneyFormat), isGroup, title) : ''
    }

    if (cardEl) {
      cardEl.hidden = false
      renderProgressCard(container, state, tiers, basePrice, addingQty, moneyFormat, tierButtonsSignatureRef)
    }

    const breakdownEl = container.querySelector('[data-tier-pricing-breakdown]')
    if (breakdownEl) {
      const summary = computeOrderSummary(basePrice, addingQty, unit)
      const unitLabel = addingQty === 1 ? ' unit' : ' units'
      let breakdown = addingQty + unitLabel + ' × ' + formatMoney(unit, moneyFormat)
      if (summary.savings > 0) {
        breakdown += ' · full price ' + formatMoney(summary.fullPrice, moneyFormat) + ' — you save ' + formatMoney(summary.savings, moneyFormat)
      }
      breakdownEl.textContent = breakdown
    }
  }

  function renderProgressCard(container, state, tiers, basePrice, addingQty, moneyFormat, tierButtonsSignatureRef) {
    const calloutEl = container.querySelector('[data-tier-pricing-callout]')
    const tickEl = container.querySelector('[data-tier-pricing-tick]')
    const cartSegmentEl = container.querySelector('[data-tier-pricing-cart-segment]')
    const addingSegmentEl = container.querySelector('[data-tier-pricing-adding-segment]')
    const dotEl = container.querySelector('[data-tier-pricing-dot]')
    const scaleEl = container.querySelector('[data-tier-pricing-scale]')
    const tiersEl = container.querySelector('[data-tier-pricing-tiers]')

    calloutEl.textContent = formatCalloutText(state, tiers, basePrice, (n) => formatMoney(n, moneyFormat))
    calloutEl.style.left = state.calloutPct + '%'
    tickEl.style.left = state.calloutPct + '%'
    dotEl.style.left = state.calloutPct + '%'
    cartSegmentEl.style.width = state.cartPct + '%'
    addingSegmentEl.style.width = state.addedPct + '%'

    const sorted = tiers.slice().sort((a, b) => a.minQty - b.minQty)
    scaleEl.innerHTML = ''
    const zeroLabel = document.createElement('span')
    zeroLabel.textContent = '0'
    scaleEl.appendChild(zeroLabel)
    sorted.slice(1).forEach((t) => {
      const label = document.createElement('span')
      label.textContent = t.minQty + ' · ' + formatMoney(unitPriceAtTier(basePrice, t), moneyFormat) + ' ea'
      scaleEl.appendChild(label)
    })

    // Rebuilding this section (tier buttons + the dashed temp-box) is
    // destructive: it replays the temp-box's fade/scale-in animation and
    // clears any focus the customer has placed on a tier button. In group
    // mode this render runs on a 1-second poll, so we skip the rebuild
    // entirely when nothing that affects it has actually changed since the
    // last render. `tierButtonsSignatureRef.value` starts at null, which
    // never equals a real (string) signature, so the very first render for
    // this container always populates the buttons.
    const tierButtonsSignature = computeTierButtonsSignature(state, basePrice, addingQty)
    if (tierButtonsSignatureRef && tierButtonsSignatureRef.value === tierButtonsSignature) {
      return
    }
    if (tierButtonsSignatureRef) {
      tierButtonsSignatureRef.value = tierButtonsSignature
    }

    tiersEl.innerHTML = ''
    state.tierButtons.forEach((btn, i) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'sparkly-tier-pricing__tier-btn' + (btn.active ? ' sparkly-tier-pricing__tier-btn--active' : '')
      el.textContent = btn.minQty + ' x ' + formatMoney(totalAtTier(basePrice, sorted[i]), moneyFormat)
      el.addEventListener('click', () => setQuantityInput(btn.minQty))
      tiersEl.appendChild(el)

      if (state.tempBox && state.tempBox.afterIndex === i) {
        const temp = document.createElement('span')
        temp.className = 'sparkly-tier-pricing__temp-btn'
        temp.textContent = formatTempBoxLabel(state, basePrice, addingQty, (n) => formatMoney(n, moneyFormat))
        tiersEl.appendChild(temp)
      }
    })
  }

  function setQuantityInput(value) {
    const input = document.querySelector('input[name="quantity"]')
    if (!input) return
    input.value = String(value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function renderMixMatchList(listEl, siblings, cartItems) {
    listEl.innerHTML = ''
    siblings.forEach((s) => {
      const qty = sumGroupQuantityInCart(cartItems || [], [s.handle])

      const row = document.createElement('a')
      row.href = '/products/' + s.handle
      row.className = 'sparkly-tier-pricing__list-item'

      if (s.imageUrl) {
        const img = document.createElement('img')
        img.src = s.imageUrl
        img.alt = s.title
        img.className = 'sparkly-tier-pricing__list-thumb'
        row.appendChild(img)
      } else {
        const placeholder = document.createElement('span')
        placeholder.className = 'sparkly-tier-pricing__list-thumb sparkly-tier-pricing__list-thumb--placeholder'
        row.appendChild(placeholder)
      }

      const name = document.createElement('span')
      name.className = 'sparkly-tier-pricing__list-name'
      name.textContent = s.title
      row.appendChild(name)

      const qtyLabel = document.createElement('span')
      qtyLabel.className = 'sparkly-tier-pricing__list-qty'
      qtyLabel.textContent = qty === 1 ? '1 in cart' : qty + ' in cart'
      row.appendChild(qtyLabel)

      listEl.appendChild(row)
    })
  }

  async function fetchCart() {
    const res = await fetch('/cart.js')
    return res.json()
  }

  function initTierPricing() {
    const containers = document.querySelectorAll('[data-sparkly-tier-pricing]')
    containers.forEach((container) => {
      const standaloneData = JSON.parse(container.dataset.tiers)
      const moneyFormat = JSON.parse(container.dataset.moneyFormat)
      const group = JSON.parse(container.dataset.group)
      const productHandle = JSON.parse(container.dataset.productHandle)
      // withUnitAnchor adds the "buy 1 at base price" tier the merchandiser
      // never has to configure explicitly — see its definition for why this
      // is price-neutral and only affects the button row / temp-box range.
      const tiers = withUnitAnchor(group ? group.tiers : standaloneData.tiers)
      const title = group ? group.title : standaloneData.title

      // Per-container signature of the last-rendered tier buttons/temp-box,
      // used by renderProgressCard to skip rebuilding that section's DOM
      // when nothing relevant changed (e.g. on every tick of the cart-aware
      // 1s poll below). null is a sentinel that can never equal a real
      // (string) signature, so the first render always populates it.
      const tierButtonsSignatureRef = { value: null }

      // Last cart snapshot fetched by renderWithGroupAwareness, reused so the
      // mix & match list can show each sibling's in-cart quantity without a
      // separate fetch — kept fresh by the same poll/event triggers that
      // already re-fetch the cart for the combined-quantity calculation.
      let lastCartItems = []

      // Every handle that counts toward this discount's combined quantity —
      // this product itself plus, in group mode, its siblings. Standalone
      // mode is just the one-element case of the same formula below.
      const allDiscountHandles = group ? [productHandle].concat(group.siblings.map((s) => s.handle)) : [productHandle]
      const mixMatchListItems = group ? [group.self].concat(group.siblings) : []

      // Tracks this exact product's own cart-resident quantity across
      // renders, so we can detect "a real Add to Cart just succeeded" (the
      // quantity went UP since we last checked) and reset the stepper back
      // to its floor of 1 — confirmed live that this theme's native stepper
      // does NOT do this itself; it stays at whatever was last submitted.
      // Without this reset, the next render would double-count: the
      // just-added units are now part of the freshly-fetched cart total
      // (cartBaselineOtherQty) AND still sitting in the stale addingQty.
      // null (not 0) is the "haven't observed a baseline yet" sentinel, so
      // the very first render never fires a false reset.
      let lastKnownSelfQty = null

      // otherQty now reflects the TRUE combined quantity already sitting in
      // the customer's real cart — across every product that counts toward
      // this discount, including this exact product — via
      // cartBaselineOtherQty (see its own doc comment for the "-1"). Before
      // this, this product's own cart-resident quantity was invisible to
      // the widget entirely: reloading a page for a product you already
      // have some of showed a progress bar/price that silently ignored
      // those units, and undercounted group discounts that were already
      // earned. addingQty (the live on-page stepper) is unchanged — it
      // still can't go below 1, which is exactly what keeps the combined
      // total from ever reading below the true cart amount.
      const hasTiers = !!(tiers && tiers.length > 0)

      async function renderWithGroupAwareness() {
        // No discount configured at all: renderTierPricing's own early
        // return already handles this (plain price, card hidden) — skip
        // the cart fetch entirely rather than doing it on every quantity
        // change/poll tick for the common undiscounted-product case.
        if (!hasTiers) {
          renderTierPricing(container, tiers, moneyFormat, 0, title, !!group, tierButtonsSignatureRef)
          return
        }

        let otherQty = 0
        try {
          const cart = await fetchCart()
          lastCartItems = cart.items
          const trueCartQty = sumGroupQuantityInCart(cart.items, allDiscountHandles)
          otherQty = cartBaselineOtherQty(trueCartQty)

          const selfQtyNow = sumGroupQuantityInCart(cart.items, [productHandle])
          if (lastKnownSelfQty != null && selfQtyNow > lastKnownSelfQty) {
            setQuantityInput(1)
          }
          lastKnownSelfQty = selfQtyNow
        } catch {
          otherQty = 0
        }
        renderTierPricing(container, tiers, moneyFormat, otherQty, title, !!group, tierButtonsSignatureRef)
        if (group && listEl && !listEl.hidden) {
          renderMixMatchList(listEl, mixMatchListItems, lastCartItems)
        }
      }

      const toggleEl = container.querySelector('[data-tier-pricing-toggle]')
      const listEl = container.querySelector('[data-tier-pricing-list]')
      if (toggleEl && listEl && group) {
        let open = false
        toggleEl.addEventListener('click', () => {
          open = !open
          listEl.hidden = !open
          toggleEl.textContent = 'mix & match products ' + (open ? '▲' : '▼')
          if (open) renderMixMatchList(listEl, mixMatchListItems, lastCartItems)
        })
      }

      renderWithGroupAwareness()

      const quantityInput = document.querySelector('input[name="quantity"]')
      if (quantityInput) {
        quantityInput.addEventListener('input', renderWithGroupAwareness)
        quantityInput.addEventListener('change', renderWithGroupAwareness)

        // This theme's +/- stepper buttons set the input's value
        // programmatically without dispatching input/change on it, so we
        // hook the buttons' own click events directly instead of polling
        // for a value change. Affects both standalone and group mode now,
        // since group mode also reads the selector as addingQty.
        // Scoped to this quantity widget (not document-wide) since the
        // cart drawer's own per-line steppers use the same aria-labels.
        // Deferred one tick so we read the value after the theme's own
        // click handler has updated it.
        const quantityScope = quantityInput.closest('product-quantity') || quantityInput.closest('form') || document
        quantityScope.querySelectorAll('button[aria-label="Increase quantity"], button[aria-label="Decrease quantity"]').forEach((btn) => {
          btn.addEventListener('click', () => setTimeout(renderWithGroupAwareness, 0))
        })
      }

      const addToCartForm = document.querySelector('form[action*="/cart/add"]')
      if (addToCartForm) {
        // Best-effort immediate re-check after a real submission, so the
        // price/progress bar (and the post-add stepper reset above) don't
        // wait for the next poll tick. If /cart/add.js hasn't finished yet
        // this briefly under-counts, never over-counts, and self-corrects
        // on the next poll or visibilitychange.
        addToCartForm.addEventListener('submit', () => {
          renderWithGroupAwareness()
        })
      }

      const productVariantsEl = document.querySelector('product-variants')
      if (productVariantsEl) {
        productVariantsEl.addEventListener('VARIANT_CHANGE', (event) => {
          const variant = event.target.currentVariant
          if (variant && typeof variant.price === 'number') {
            container.dataset.basePrice = String(variant.price / 100)
          }
          renderWithGroupAwareness()
        })
      }

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
          renderWithGroupAwareness()
        }
      }, 200)

      if (hasTiers) {
        // Not just group mode any more: a standalone-discounted product's
        // own cart-resident quantity can also change from elsewhere (cart
        // drawer, another tab) while this page sits open, and the widget
        // needs to notice without a reload.
        setInterval(renderWithGroupAwareness, 1000)

        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            renderWithGroupAwareness()
          }
        })
      }
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTierPricing)
  } else {
    initTierPricing()
  }
}
