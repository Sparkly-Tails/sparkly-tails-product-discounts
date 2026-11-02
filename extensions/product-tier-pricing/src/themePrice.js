// The product page's own price, changed in place while a tier discount applies. The theme's markup and look are not
// assumed: the price is found by what it says (the product's plain price and nothing else but a currency code), nearest
// to the widget, never by a class name or a section element. Its text is replaced inside the same element, so the theme's
// own type, colour and size carry on. It shows the unit price and "each" and draws no struck price: a compare-at price that
// the theme shows stays the theme's own. Below the first tier, or when no price is found, the theme's price is left as it was.
// Every step comes in through `tools`, so each one can be tried alone.

import { PAGE_ELEMENT_TOOLS } from './pageElements.js'
import { SALE_BADGE_TOOLS } from './themeSaleBadge.js'

const WAS_ATTRIBUTE = 'data-smooth-discounts-was'
const NOW_ATTRIBUTE = 'data-smooth-discounts-now'
const CURRENCY_CODE = /^[A-Z]{3}$/
const MAX_LEVELS = 8
const EACH_LABEL = 'each'

/** The text is the plain price, alone or with a currency code beside it ("£1.69", "£1.69 GBP"). */
export function isAmountText({ text, plainPrice }) {
  const index = text.indexOf(plainPrice)
  if (index === -1) return false
  const rest = (text.slice(0, index) + text.slice(index + plainPrice.length)).trim()
  return rest === '' || CURRENCY_CODE.test(rest)
}

/** The highest ancestor looked in: a few levels above the widget, never the page's body (the widget's own parent at least). */
export function findSearchRoot({ rootEl, tools }) {
  const levels = tools.listAncestors({ element: rootEl }).slice(1, MAX_LEVELS + 1).filter(tools.isBelowBody)
  return levels[levels.length - 1] || rootEl.parentElement
}

/** How many levels up from the widget until an ancestor holds the element: the smaller, the nearer. */
export function measureDistance({ rootEl, element, tools }) {
  return tools.listAncestors({ element: rootEl }).findIndex(tools.hasDescendant.bind(null, element))
}

export function buildDistanceEntry({ rootEl, tools }, element) {
  return { element, steps: tools.measureDistance({ rootEl, element, tools }) }
}

export function compareSteps(first, second) {
  return first.steps - second.steps
}

export function isMarkedPrice(element) {
  return element.hasAttribute(WAS_ATTRIBUTE)
}

export function isAmountElement({ plainPrice, tools }, element) {
  return element.children.length === 0 && tools.isAmountText({ text: element.textContent.trim(), plainPrice })
}

export function isPriceMatch({ plainPrice, tools }, element) {
  return tools.isMarkedPrice(element) || tools.isAmountElement({ plainPrice, tools }, element)
}

/** A price outside the widget that the page shows: the one this script changed, or an element with nothing in it but the plain price. The cheap checks come first. */
export function isPriceElement({ rootEl, plainPrice, tools }, element) {
  return !rootEl.contains(element) && tools.isPriceMatch({ plainPrice, tools }, element) && tools.isVisible({ element, tools })
}

/** The price element nearest the widget (the first in document order among equals), or null. */
export function findThemePrice({ rootEl, plainPrice, tools }) {
  const found = Array.from(tools.findSearchRoot({ rootEl, tools }).querySelectorAll('*')).filter(tools.isPriceElement.bind(null, { rootEl, plainPrice, tools }))
  const entries = found.map(tools.buildDistanceEntry.bind(null, { rootEl, tools })).sort(tools.compareSteps)
  return entries.length > 0 ? entries[0].element : null
}

/** Still holding the "each" label this script wrote: a theme that sets the price's text itself (a variant change) leaves only the marks. */
export function isPaintedPrice(priceEl) {
  return priceEl.hasAttribute(WAS_ATTRIBUTE) && priceEl.children.length === 1
}

export function removeMarks(priceEl) {
  priceEl.removeAttribute(WAS_ATTRIBUTE)
  priceEl.removeAttribute(NOW_ATTRIBUTE)
}

/** Puts the theme's own text back. */
export function restorePrice({ priceEl, tools }) {
  if (tools.isPaintedPrice(priceEl)) priceEl.textContent = priceEl.getAttribute(WAS_ATTRIBUTE)
  tools.removeMarks(priceEl)
}

export function readOriginalText({ priceEl, tools }) {
  return tools.isPaintedPrice(priceEl) ? priceEl.getAttribute(WAS_ATTRIBUTE) : priceEl.textContent.trim()
}

export function isCurrentPaint({ priceEl, nowText, tools }) {
  return tools.isPaintedPrice(priceEl) && priceEl.getAttribute(NOW_ATTRIBUTE) === nowText
}

/** The unit price, then "each", in the theme's own element. */
export function writeUnitPrice({ priceEl, originalText, nowText }) {
  const doc = priceEl.ownerDocument
  const each = doc.createElement('small')
  each.textContent = EACH_LABEL
  priceEl.textContent = ''
  priceEl.append(doc.createTextNode(nowText + ' '), each)
  priceEl.setAttribute(WAS_ATTRIBUTE, originalText)
  priceEl.setAttribute(NOW_ATTRIBUTE, nowText)
}

export function paintUnitPrice({ priceEl, plainPrice, discountedPrice, tools }) {
  const originalText = tools.readOriginalText({ priceEl, tools })
  const nowText = originalText.replace(plainPrice, discountedPrice)
  if (tools.isCurrentPaint({ priceEl, nowText, tools })) return
  tools.writeUnitPrice({ priceEl, originalText, nowText })
}

export function paintFoundPrice({ priceEl, rootEl, viewModel, tools }) {
  if (!priceEl) return
  if (viewModel.discountedPrice) tools.paintUnitPrice({ priceEl, plainPrice: viewModel.plainPrice, discountedPrice: viewModel.discountedPrice, tools })
  else tools.restorePrice({ priceEl, tools })
  tools.paintSaleBadge({ priceEl, rootEl, tools })
}

export function paintThemePrice({ elements, viewModel, tools }) {
  if (!viewModel.plainPrice) return
  const priceEl = tools.findThemePrice({ rootEl: elements.rootEl, plainPrice: viewModel.plainPrice, tools })
  tools.paintFoundPrice({ priceEl, rootEl: elements.rootEl, viewModel, tools })
}

export const THEME_PRICE_TOOLS = {
  ...PAGE_ELEMENT_TOOLS, ...SALE_BADGE_TOOLS,
  isAmountText, findSearchRoot, measureDistance, buildDistanceEntry, compareSteps,
  isMarkedPrice, isAmountElement, isPriceMatch, isPriceElement, findThemePrice, isPaintedPrice, removeMarks, restorePrice, readOriginalText,
  isCurrentPaint, writeUnitPrice, paintUnitPrice, paintFoundPrice,
}
