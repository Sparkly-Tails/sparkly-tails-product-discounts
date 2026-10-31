// Two small page helpers the painters share.

// Rewrites text only when it changed: live regions re-announce on every
// write, and the widget repaints once a second.
export function setText(el, text) {
  if (el && el.textContent !== text) el.textContent = text
}

export function setQuantityInput(value) {
  const input = document.querySelector('input[name="quantity"]')
  if (!input) return
  input.value = String(value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}
