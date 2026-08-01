function computeTierState(tiers, quantity) {
  const sorted = tiers.slice().sort((a, b) => a.minQty - b.minQty)
  const reached = sorted.filter((t) => t.minQty <= quantity)
  const notReached = sorted.filter((t) => t.minQty > quantity)

  if (reached.length === 0) {
    return {
      percentOff: 0,
      anchorPrice: null,
      minQty: null,
      nextTier: null,
      remainingTiers: notReached.map((t) => ({
        minQty: t.minQty,
        percentOff: t.percentOff,
        delta: t.minQty - quantity,
      })),
    }
  }

  const reachedTier = reached[reached.length - 1]
  const percentOff = reachedTier.percentOff
  const anchorPrice = reachedTier.anchorPrice != null ? reachedTier.anchorPrice : null

  if (notReached.length === 0) {
    return { percentOff, anchorPrice, minQty: reachedTier.minQty, nextTier: null, remainingTiers: null }
  }

  const next = notReached[0]
  return {
    percentOff,
    anchorPrice,
    minQty: reachedTier.minQty,
    nextTier: { minQty: next.minQty, percentOff: next.percentOff, delta: next.minQty - quantity },
    remainingTiers: null,
  }
}

// Blended per-unit price when a tier has an anchorPrice: anchorPrice covers
// the first minQty units exactly, and every unit beyond that still accrues
// at the tier's normal percentOff rate — mirrors the Function's
// FixedAmount discount_amount math exactly (see
// extensions/product-discount/src/cart_lines_discounts_generate_run.rs) so
// the live preview always matches what checkout will actually charge. The
// Function clamps its discount to never go negative (never charge more than
// sticker price); clamp the same way here, or a misconfigured anchor above
// the full price would render as a fake "discount" that's actually a markup
// (a strikethrough original price lower than the "sale" price next to it).
function perUnitPrice(basePrice, quantity, state) {
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

// Append to extensions/product-tier-pricing/assets/tier-pricing.js,
// AFTER the `if (typeof module !== 'undefined' ...)` guard from Task 4.
// This part only runs in the browser (document is undefined in Node.js),
// so it's safe to reference `document`/`window` unconditionally below.

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
    if (state.percentOff > 0) {
      discounted = perUnitPrice(basePrice, quantity, state)
      priceEl.innerHTML =
        '<s>' + formatMoney(basePrice, moneyFormat) + '</s> ' + formatMoney(discounted, moneyFormat)
    } else {
      priceEl.textContent = formatMoney(basePrice, moneyFormat)
    }

    if (state.percentOff > 0) {
      const savings = basePrice - discounted
      const discountLine = 'Discount ' + state.percentOff + '% off (-' + formatMoney(savings, moneyFormat) + ')'

      if (state.nextTier) {
        messageEl.innerHTML =
          discountLine + '<br>Add ' + state.nextTier.delta + ' more for ' + state.nextTier.percentOff + '% Off'
      } else {
        messageEl.textContent = discountLine
      }
    } else if (state.remainingTiers && state.remainingTiers.length > 0) {
      messageEl.textContent = state.remainingTiers
        .map((t) => 'Add ' + t.delta + ' for ' + t.percentOff + '% Off')
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

      function currentSelectorQuantity() {
        const quantityInput = document.querySelector('input[name="quantity"]')
        return quantityInput ? Number(quantityInput.value) || 1 : 1
      }

      // Group mode needs the combined quantity of every group product
      // already in the cart (this product's own line included) plus
      // whatever's set in the quantity selector but not yet added — plain
      // single-product mode just renders with the selector value, same as
      // before this feature.
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
        const effectiveQuantity = cartQuantity + currentSelectorQuantity()
        renderTierPricing(container, tiers, moneyFormat, effectiveQuantity)
        renderGroupLinks(container, group.siblings)
      }

      renderWithGroupAwareness()

      const quantityInput = document.querySelector('input[name="quantity"]')
      if (quantityInput) {
        quantityInput.addEventListener('input', renderWithGroupAwareness)
        quantityInput.addEventListener('change', renderWithGroupAwareness)

        // The theme's +/- quantity stepper sets `.value` programmatically
        // without dispatching an `input`/`change` event, so the listeners
        // above never fire for stepper clicks. Poll for a value change as a
        // theme-agnostic fallback.
        let lastQuantity = quantityInput.value
        setInterval(() => {
          if (quantityInput.value !== lastQuantity) {
            lastQuantity = quantityInput.value
            renderWithGroupAwareness()
          }
        }, 200)
      }

      // This theme's <product-variants> custom element dispatches a plain
      // Event('VARIANT_CHANGE') on itself (not document, and it doesn't
      // bubble) — not the generic "variant:change" CustomEvent-on-document
      // convention some themes use. Variant data lives at
      // event.target.currentVariant. See
      // assets/component-product-form.js (ProductVariants.onVariantChange)
      // in the theme.
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

      // Loop Subscriptions' one-time/subscribe toggle doesn't change the
      // variant, and only fires Loop's own undocumented internal events —
      // not a stable contract to hook directly. Loop already renders the
      // correct per-unit price for whichever purchase option is selected,
      // so poll that instead.
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

      // Group mode's whole point is reacting to OTHER group products being
      // added to the cart from elsewhere on the page (or the cart drawer)
      // while this page is open — there's no local DOM event for that, so
      // poll /cart.js. Only active in group mode; plain single-product
      // pages get no extra network traffic.
      if (group) {
        setInterval(renderWithGroupAwareness, 1000)
      }
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTierPricing)
  } else {
    initTierPricing()
  }
}
