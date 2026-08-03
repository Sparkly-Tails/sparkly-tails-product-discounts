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
    return state.fixedPrice
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeTierState, perUnitPrice, sumGroupQuantityInCart }
}

if (typeof document !== 'undefined') {
  function formatMoney(amount, format) {
    const withDecimals = amount.toFixed(2)
    return format.replace(/\{\{\s*amount\s*\}\}/, withDecimals)
  }

  function renderTierPricing(container, tiers, moneyFormat, quantityOverride) {
    const priceEl = container.querySelector('[data-tier-pricing-price]')
    const messageEl = container.querySelector('[data-tier-pricing-message]')
    const basePrice = Number(container.dataset.basePrice)
    const quantityInput = document.querySelector('input[name="quantity"]')
    const selectorQuantity = quantityInput ? Number(quantityInput.value) || 1 : 1
    const quantity = quantityOverride != null ? quantityOverride : selectorQuantity

    const state = computeTierState(tiers, quantity)

    let discounted
    const isDiscounted = state.fixedPrice != null || state.percentOff > 0
    if (isDiscounted) {
      discounted = perUnitPrice(basePrice, quantity, state)
      priceEl.innerHTML =
        '<s>' + formatMoney(basePrice, moneyFormat) + '</s> ' + formatMoney(discounted, moneyFormat)
    } else {
      priceEl.textContent = formatMoney(basePrice, moneyFormat)
    }

    if (state.fixedPrice != null) {
      const priceLine = formatMoney(state.fixedPrice, moneyFormat) + ' each'
      if (state.nextTier) {
        const nextLabel =
          state.nextTier.fixedPrice != null
            ? formatMoney(state.nextTier.fixedPrice, moneyFormat) + ' each'
            : state.nextTier.percentOff + '% Off'
        messageEl.innerHTML = priceLine + '<br>Add ' + state.nextTier.delta + ' more for ' + nextLabel
      } else {
        messageEl.textContent = priceLine
      }
    } else if (state.percentOff > 0) {
      const savings = basePrice - discounted
      const discountLine = 'Discount ' + state.percentOff + '% off (-' + formatMoney(savings, moneyFormat) + ')'

      if (state.nextTier) {
        const nextLabel =
          state.nextTier.fixedPrice != null
            ? formatMoney(state.nextTier.fixedPrice, moneyFormat) + ' each'
            : state.nextTier.percentOff + '% Off'
        messageEl.innerHTML = discountLine + '<br>Add ' + state.nextTier.delta + ' more for ' + nextLabel
      } else {
        messageEl.textContent = discountLine
      }
    } else if (state.remainingTiers && state.remainingTiers.length > 0) {
      messageEl.textContent = state.remainingTiers
        .map((t) => {
          const label = t.fixedPrice != null ? formatMoney(t.fixedPrice, moneyFormat) + ' each' : t.percentOff + '% Off'
          return 'Add ' + t.delta + ' for ' + label
        })
        .join(' or ')
    } else {
      messageEl.textContent = ''
    }
  }

  async function fetchCart() {
    const res = await fetch('/cart.js')
    return res.json()
  }

  function renderGroupLinks(container, siblings) {
    const linksEl = container.querySelector('[data-tier-pricing-group-links]')
    if (!linksEl) return
    linksEl.textContent = ''
    if (!siblings || siblings.length === 0) return
    siblings.forEach((s, i) => {
      if (i > 0) linksEl.appendChild(document.createTextNode(', '))
      const a = document.createElement('a')
      a.href = '/products/' + s.handle
      a.textContent = s.title
      linksEl.appendChild(a)
    })
  }

  function initTierPricing() {
    const containers = document.querySelectorAll('[data-sparkly-tier-pricing]')
    containers.forEach((container) => {
      const standaloneTiers = JSON.parse(container.dataset.tiers).tiers
      const moneyFormat = JSON.parse(container.dataset.moneyFormat)
      const group = JSON.parse(container.dataset.group)
      const productHandle = JSON.parse(container.dataset.productHandle)
      const tiers = group ? group.tiers : standaloneTiers

      // Group mode always reflects the REAL cart, never the on-page
      // quantity selector — the selector's value isn't in the cart until
      // Add to Cart is actually submitted, and this theme doesn't reset it
      // afterwards, so treating it as "pending" caused the discount to
      // show for quantities that were never really in the cart. Simpler
      // and correct: only ever trust what /cart.js reports.
      async function renderWithGroupAwareness() {
        if (!group) {
          renderTierPricing(container, tiers, moneyFormat)
          return
        }
        const handles = [productHandle].concat(group.siblings.map((s) => s.handle))
        let cartQuantity = 0
        try {
          const cart = await fetchCart()
          cartQuantity = sumGroupQuantityInCart(cart.items, handles)
        } catch {
          cartQuantity = 0
        }
        renderTierPricing(container, tiers, moneyFormat, cartQuantity)
        renderGroupLinks(container, group.siblings)
      }

      renderWithGroupAwareness()

      const quantityInput = document.querySelector('input[name="quantity"]')
      if (quantityInput) {
        quantityInput.addEventListener('input', renderWithGroupAwareness)
        quantityInput.addEventListener('change', renderWithGroupAwareness)

        // This theme's +/- stepper buttons set the input's value
        // programmatically without dispatching input/change on it, so we
        // hook the buttons' own click events directly instead of polling
        // for a value change. Only affects the standalone (non-group)
        // price preview now — group mode ignores the selector entirely.
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
