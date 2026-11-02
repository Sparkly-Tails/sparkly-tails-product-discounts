// The theme's own "Sale" badge, hidden while the tier unit price shows in the theme's price. The badge is found by its word
// (the text "Sale" alone, in any letter case) among the elements a few levels around the price, never by a class name. It is
// hidden with an inline `display: none`, which no theme rule overrides, and the display it had is put back below the first tier.
// Every step comes in through `tools`, so each one can be tried alone.

const HIDDEN_ATTRIBUTE = 'data-smooth-discounts-hid'
const SALE_WORD = 'sale'
const BADGE_LEVELS = 4

export function isSaleText(element) {
  return element.children.length === 0 && element.textContent.trim().toLowerCase() === SALE_WORD
}

export function isMarkedBadge(element) {
  return element.hasAttribute(HIDDEN_ATTRIBUTE)
}

export function isShownSaleText({ tools }, element) {
  return tools.isSaleText(element) && tools.isDisplayed(element)
}

/** A badge outside the widget: one this script hid, or an element showing the word alone. */
export function isSaleBadge({ rootEl, tools }, element) {
  return !rootEl.contains(element) && (tools.isMarkedBadge(element) || tools.isShownSaleText({ tools }, element))
}

/** A few levels above the price, never the page's body. */
export function findBadgeRoot({ priceEl, tools }) {
  const levels = tools.listAncestors({ element: priceEl }).slice(0, BADGE_LEVELS + 1).filter(tools.isBelowBody)
  return levels[levels.length - 1] || priceEl
}

export function findSaleBadges({ priceEl, rootEl, tools }) {
  return Array.from(tools.findBadgeRoot({ priceEl, tools }).querySelectorAll('*')).filter(tools.isSaleBadge.bind(null, { rootEl, tools }))
}

export function hideBadge(badge) {
  if (badge.hasAttribute(HIDDEN_ATTRIBUTE)) return
  badge.setAttribute(HIDDEN_ATTRIBUTE, badge.style.display)
  badge.style.display = 'none'
}

export function showBadge(badge) {
  badge.style.display = badge.getAttribute(HIDDEN_ATTRIBUTE)
  badge.removeAttribute(HIDDEN_ATTRIBUTE)
}

export function paintSaleBadge({ priceEl, rootEl, isDiscounted, tools }) {
  const badges = tools.findSaleBadges({ priceEl, rootEl, tools })
  if (isDiscounted) badges.forEach(tools.hideBadge)
  else badges.filter(tools.isMarkedBadge).forEach(tools.showBadge)
}

export const SALE_BADGE_TOOLS = {
  isSaleText, isMarkedBadge, isShownSaleText, isSaleBadge, findBadgeRoot, findSaleBadges, hideBadge, showBadge, paintSaleBadge,
}
