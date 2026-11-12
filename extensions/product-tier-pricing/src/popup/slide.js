// Slides the tier chips of a box: the row of chips scrolls sideways when they do not fit, and the chip of the customer's units is moved to the row's left edge so that it stays in view.
// Nothing here reads the page: the box's element comes in as an argument.
const ROW_SELECTOR = '.smooth-discounts-popup__chips'
const CURRENT_SELECTOR = '[data-tag="current"]'

/** How far the row of chips in the box is scrolled now; 0 when the box shows no chips. */
export function readRowStart({ element }) {
  const row = element.querySelector(ROW_SELECTOR)
  return row === null ? 0 : row.scrollLeft
}

/** Where to scroll the row so the chip's left edge meets the row's: the chip's distance from the row's edge plus how far the row is scrolled already. */
export function computeSlideLeft({ chipLeft, rowLeft, scrollLeft }) {
  return chipLeft - rowLeft + scrollLeft
}

/** Scrolls the row to `left`: at once for 'instant', else the way the stylesheet says ('auto': smoothly, unless the customer asked for reduced motion). A browser without Element.scrollTo leaves it alone. */
export function moveRow({ row, left, behavior }) {
  if (typeof row.scrollTo === 'function') row.scrollTo({ left, behavior })
}

/** The chips were drawn again (the row is back at its start): puts the row where it was, then slides the chip of the customer's units to its left edge. A box with no chips, or none for the customer's units, is left alone. */
export function slideChips(tools, { element, start }) {
  const row = element.querySelector(ROW_SELECTOR)
  const chip = element.querySelector(CURRENT_SELECTOR)
  if (row === null || chip === null) return
  tools.moveRow({ row, left: start, behavior: 'instant' })
  const left = tools.computeSlideLeft({ chipLeft: chip.getBoundingClientRect().left, rowLeft: row.getBoundingClientRect().left, scrollLeft: row.scrollLeft })
  tools.moveRow({ row, left, behavior: 'auto' })
}

export const SLIDE_TOOLS = { readRowStart, computeSlideLeft, moveRow, slideChips }
