// Keeps the active box of the tier row in view: the row scrolls sideways, and the box of the current quantity (the dashed one
// between two tiers, or past the top tier, else the ticked tier) is moved into the visible part of it.

const CURRENT_CHIP_SELECTOR = '.smooth-discounts__chip[class*="--current-"]'
const PRESSED_CHIP_SELECTOR = '.smooth-discounts__chip[aria-pressed="true"]'

// Where the row should be scrolled so the box is fully in view: where it is now when the box already is, the start of the box
// when it is cut at the left (or is wider than the row), or just far enough to show its right edge.
export function computeScrollLeft({ chipLeft, chipWidth, viewLeft, viewWidth }) {
  const chipRight = chipLeft + chipWidth
  if (chipLeft < viewLeft || chipWidth > viewWidth) return chipLeft
  return chipRight > viewLeft + viewWidth ? chipRight - viewWidth : viewLeft
}

// The box of the current quantity, or null when the row has none.
export function pickActiveChip(tiersEl) {
  return tiersEl.querySelector(CURRENT_CHIP_SELECTOR) || tiersEl.querySelector(PRESSED_CHIP_SELECTOR)
}

export const CHIP_SCROLL_TOOLS = { pickActiveChip, computeScrollLeft }

// Only the row itself scrolls (the page does not move); a row that is not shown (no width) is left alone.
export function scrollActiveChipIntoView({ tiersEl, tools }) {
  const chip = tools.pickActiveChip(tiersEl)
  if (!chip || !tiersEl.clientWidth) return
  const viewLeft = tiersEl.scrollLeft
  const chipRect = chip.getBoundingClientRect()
  const chipLeft = chipRect.left - tiersEl.getBoundingClientRect().left + viewLeft
  tiersEl.scrollLeft = tools.computeScrollLeft({ chipLeft, chipWidth: chipRect.width, viewLeft, viewWidth: tiersEl.clientWidth })
}
