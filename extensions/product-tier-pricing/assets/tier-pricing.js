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

  let tempBox = null
  for (let i = 0; i < sorted.length - 1; i++) {
    if (addingQty > sorted[i].minQty && addingQty < sorted[i + 1].minQty) {
      tempBox = { afterIndex: i, tier: sorted[i + 1] }
      break
    }
  }

  return { combinedQty, topThreshold, cartPct, addedPct, calloutPct, maxed, tierState, tierButtons, tempBox }
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
      const tiers = group ? group.tiers : standaloneData.tiers
      const title = group ? group.title : standaloneData.title

      // Per-container signature of the last-rendered tier buttons/temp-box,
      // used by renderProgressCard to skip rebuilding that section's DOM
      // when nothing relevant changed (e.g. on every tick of the group-mode
      // 1s cart poll below). null is a sentinel that can never equal a real
      // (string) signature, so the first render always populates it.
      const tierButtonsSignatureRef = { value: null }

      // Last cart snapshot fetched by renderWithGroupAwareness, reused so the
      // mix & match list can show each sibling's in-cart quantity without a
      // separate fetch — kept fresh by the same poll/event triggers that
      // already re-fetch the cart for the combined-quantity calculation.
      let lastCartItems = []

      // Group mode combines two sources: otherQty from the REAL cart (only
      // sibling products, fetched fresh from /cart.js — this product's own
      // cart-resident quantity is deliberately excluded, see the plan's
      // "Combined-quantity formula" note) plus addingQty, the live on-page
      // quantity selector value for this product. Standalone mode ignores
      // the cart entirely and uses addingQty alone.
      async function renderWithGroupAwareness() {
        if (!group) {
          renderTierPricing(container, tiers, moneyFormat, 0, title, false, tierButtonsSignatureRef)
          return
        }
        const siblingHandles = group.siblings.map((s) => s.handle)
        let otherQty = 0
        try {
          const cart = await fetchCart()
          lastCartItems = cart.items
          otherQty = sumGroupQuantityInCart(cart.items, siblingHandles)
        } catch {
          otherQty = 0
        }
        renderTierPricing(container, tiers, moneyFormat, otherQty, title, true, tierButtonsSignatureRef)
        if (listEl && !listEl.hidden) {
          renderMixMatchList(listEl, group.siblings, lastCartItems)
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
          if (open) renderMixMatchList(listEl, group.siblings, lastCartItems)
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
        // group price doesn't wait for the next poll tick. If /cart/add.js
        // hasn't finished yet this briefly under-counts, never over-counts,
        // and self-corrects on the next poll or visibilitychange.
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

      if (group) {
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
