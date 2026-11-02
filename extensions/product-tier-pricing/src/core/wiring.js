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

// How often the product form's id field is looked at, for the themes that change it without an event.
const VARIANT_FIELD_POLL_MS = 800

// The variant the buyer has chosen, read from the id field of the product form. Every theme keeps that field
// current (the form adds that variant to the cart), so this works whatever the theme's own variant picker is.
// `tools.extractNumericId` turns the field's text into the variant's number.
export function readSelectedVariantId({ root, tools }) {
  const field = root.querySelector('form[action*="/cart/add"] [name="id"]')
  return field && field.value ? tools.extractNumericId(field.value) : null
}

// Takes the variant from the form when it is not the one the widget knows, and repaints.
export function syncSelectedVariant({ root, variantStateRef, render, tools }) {
  const variantId = tools.readSelectedVariantId({ root, tools })
  if (!variantId || variantId === String(variantStateRef.value)) return
  variantStateRef.value = variantId
  render()
}

// Repaints when the chosen variant changes: on the change events themes dispatch around that field, and on a timer
// for the themes that set it without one. Only a product with a variant out of stock needs it. `tools` brings in
// extractNumericId, readSelectedVariantId, syncSelectedVariant and startTimer(callback, ms).
export function wireSelectedVariantField({ root, soldOutVariantIds, variantStateRef, render, tools }) {
  if (!soldOutVariantIds || soldOutVariantIds.length === 0) return
  const syncNow = tools.syncSelectedVariant.bind(null, { root, variantStateRef, render, tools })
  root.addEventListener('change', syncNow, true)
  tools.startTimer(syncNow, VARIANT_FIELD_POLL_MS)
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
