function computeTierState(tiers, quantity) {
  const sorted = tiers.slice().sort((a, b) => a.minQty - b.minQty)
  const reached = sorted.filter((t) => t.minQty <= quantity)
  const notReached = sorted.filter((t) => t.minQty > quantity)

  if (reached.length === 0) {
    return {
      percentOff: 0,
      nextTier: null,
      remainingTiers: notReached.map((t) => ({
        minQty: t.minQty,
        percentOff: t.percentOff,
        delta: t.minQty - quantity,
      })),
    }
  }

  const percentOff = reached[reached.length - 1].percentOff

  if (notReached.length === 0) {
    return { percentOff, nextTier: null, remainingTiers: null }
  }

  const next = notReached[0]
  return {
    percentOff,
    nextTier: { minQty: next.minQty, percentOff: next.percentOff, delta: next.minQty - quantity },
    remainingTiers: null,
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeTierState }
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

  function renderTierPricing(container, tiers, moneyFormat) {
    const priceEl = container.querySelector('[data-tier-pricing-price]')
    const messageEl = container.querySelector('[data-tier-pricing-message]')
    const basePrice = Number(container.dataset.basePrice)
    const quantityInput = document.querySelector('input[name="quantity"]')
    const quantity = quantityInput ? Number(quantityInput.value) || 1 : 1

    const state = computeTierState(tiers, quantity)

    let discounted
    if (state.percentOff > 0) {
      discounted = basePrice * (1 - state.percentOff / 100)
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

  function initTierPricing() {
    const containers = document.querySelectorAll('[data-sparkly-tier-pricing]')
    containers.forEach((container) => {
      const tiers = JSON.parse(container.dataset.tiers).tiers
      const moneyFormat = JSON.parse(container.dataset.moneyFormat)

      renderTierPricing(container, tiers, moneyFormat)

      const quantityInput = document.querySelector('input[name="quantity"]')
      if (quantityInput) {
        quantityInput.addEventListener('input', () => renderTierPricing(container, tiers, moneyFormat))
        quantityInput.addEventListener('change', () => renderTierPricing(container, tiers, moneyFormat))

        // The theme's +/- quantity stepper sets `.value` programmatically
        // (via stepUp()/stepDown() or a direct assignment) without dispatching
        // an `input`/`change` event, so the listeners above never fire for
        // stepper clicks. Poll for a value change as a theme-agnostic fallback.
        let lastQuantity = quantityInput.value
        setInterval(() => {
          if (quantityInput.value !== lastQuantity) {
            lastQuantity = quantityInput.value
            renderTierPricing(container, tiers, moneyFormat)
          }
        }, 200)
      }

      // This theme's <product-variants> custom element dispatches a plain
      // Event('VARIANT_CHANGE') on itself (not document, and it doesn't
      // bubble, since it's constructed without {bubbles: true}) — not the
      // generic "variant:change" CustomEvent-on-document convention some
      // themes use. Variant data lives at event.target.currentVariant, not
      // event.detail.variant. See assets/component-product-form.js
      // (ProductVariants.onVariantChange) in the theme.
      const productVariantsEl = document.querySelector('product-variants')
      if (productVariantsEl) {
        productVariantsEl.addEventListener('VARIANT_CHANGE', (event) => {
          const variant = event.target.currentVariant
          if (variant && typeof variant.price === 'number') {
            container.dataset.basePrice = String(variant.price / 100)
          }
          renderTierPricing(container, tiers, moneyFormat)
        })
      }

      // Loop Subscriptions' one-time/subscribe toggle doesn't change the
      // variant, and only fires Loop's own undocumented internal events
      // (onsite-event-publish, triggering-state-update) — not a stable
      // contract to hook directly. Loop already renders the correct
      // per-unit price for whichever purchase option is selected, so poll
      // that instead, same theme/app-agnostic approach as the quantity
      // poll above. Re-queried every tick (not cached at init) since the
      // Loop widget can render after this script runs.
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
          renderTierPricing(container, tiers, moneyFormat)
        }
      }, 200)
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTierPricing)
  } else {
    initTierPricing()
  }
}
