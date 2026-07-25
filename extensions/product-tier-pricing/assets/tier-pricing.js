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
      }

      document.addEventListener('variant:change', (event) => {
        if (event.detail && event.detail.variant && typeof event.detail.variant.price === 'number') {
          container.dataset.basePrice = String(event.detail.variant.price / 100)
        }
        renderTierPricing(container, tiers, moneyFormat)
      })
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTierPricing)
  } else {
    initTierPricing()
  }
}
