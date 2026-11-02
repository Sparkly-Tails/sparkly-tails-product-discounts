// The product page's own price, changed in place while a tier discount applies. The theme's markup and look are not
// assumed: the price is found by what it says (the product's plain price and nothing else but a currency code), nearest
// to the widget, never by a class name or a section element. Its text is replaced inside the same element, so the theme's
// own type, colour and size carry on; below the first tier, or when no price is found, the theme's price is left as it was.
// Every step comes in through `tools`, so each one can be tried alone.

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

/** The element and every ancestor above it, nearest first. */
export function listAncestors({ element }) {
  const ancestors = []
  for (let node = element; node; node = node.parentElement) ancestors.push(node)
  return ancestors
}

export function isBelowBody(element) {
  return element !== element.ownerDocument.body && element.ownerDocument.body.contains(element)
}

/** The highest ancestor looked in: a few levels above the widget, never the page's body (the widget's own parent at least). */
export function findSearchRoot({ rootEl, tools }) {
  const levels = tools.listAncestors({ element: rootEl }).slice(1, MAX_LEVELS + 1).filter(tools.isBelowBody)
  return levels[levels.length - 1] || rootEl.parentElement
}

export function hasDescendant(element, ancestor) {
  return ancestor.contains(element)
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

/** The element is drawn: neither it nor an ancestor has `display: none`, and it is not `visibility: hidden`. A theme can print the same price twice and hide one copy. */
export function isDisplayed(element) {
  const style = element.ownerDocument.defaultView.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

export function isVisible({ element, tools }) {
  return tools.listAncestors({ element }).every(tools.isDisplayed)
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

/** Still holding the two parts this script wrote: a theme that sets the price's text itself (a variant change) leaves only the marks. */
export function isPaintedPrice(priceEl) {
  return priceEl.hasAttribute(WAS_ATTRIBUTE) && priceEl.children.length === 2
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

/** The plain price struck, the unit price, then "each", all in the theme's own element. */
export function writeUnitPrice({ priceEl, originalText, nowText }) {
  const doc = priceEl.ownerDocument
  const struck = doc.createElement('s')
  struck.textContent = originalText
  const each = doc.createElement('small')
  each.textContent = EACH_LABEL
  priceEl.textContent = ''
  priceEl.append(struck, doc.createTextNode(' ' + nowText + ' '), each)
  priceEl.setAttribute(WAS_ATTRIBUTE, originalText)
  priceEl.setAttribute(NOW_ATTRIBUTE, nowText)
}

export function paintUnitPrice({ priceEl, plainPrice, discountedPrice, tools }) {
  const originalText = tools.readOriginalText({ priceEl, tools })
  const nowText = originalText.replace(plainPrice, discountedPrice)
  if (tools.isCurrentPaint({ priceEl, nowText, tools })) return
  tools.writeUnitPrice({ priceEl, originalText, nowText })
}

export function paintFoundPrice({ priceEl, viewModel, tools }) {
  if (!priceEl) return
  if (viewModel.discountedPrice) tools.paintUnitPrice({ priceEl, plainPrice: viewModel.plainPrice, discountedPrice: viewModel.discountedPrice, tools })
  else tools.restorePrice({ priceEl, tools })
}

export function paintThemePrice({ elements, viewModel, tools }) {
  if (!viewModel.plainPrice) return
  const priceEl = tools.findThemePrice({ rootEl: elements.rootEl, plainPrice: viewModel.plainPrice, tools })
  tools.paintFoundPrice({ priceEl, viewModel, tools })
}

export const THEME_PRICE_TOOLS = {
  isAmountText, listAncestors, isBelowBody, findSearchRoot, hasDescendant, measureDistance, buildDistanceEntry, compareSteps,
  isMarkedPrice, isAmountElement, isPriceMatch, isDisplayed, isVisible, isPriceElement, findThemePrice, isPaintedPrice, removeMarks, restorePrice, readOriginalText,
  isCurrentPaint, writeUnitPrice, paintUnitPrice, paintFoundPrice,
}
