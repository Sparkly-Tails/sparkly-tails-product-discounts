// What makes the widget repaint: the quantity stepper, the add-to-cart form, variant changes and polling.
import { extractNumericId } from '../tierMath.js'

// DOM: event wiring — each function attaches one behavior and calls render().

export function wireQuantityStepper(render) {
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

export function wireAddToCartForm(render) {
  const addToCartForm = document.querySelector('form[action*="/cart/add"]')
  if (!addToCartForm) return
  // Best-effort immediate re-check; self-corrects on the next poll if
  // /cart/add.js hasn't finished yet.
  addToCartForm.addEventListener('submit', () => render())
}

export function wireVariantChange(container, render) {
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

export function wireLoopSubscriptionsPricePoll(container, render) {
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

export function wireCartAwarePolling(render) {
  setInterval(render, 1000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') render()
  })
}
