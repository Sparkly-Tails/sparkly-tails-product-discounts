// Small questions about elements on the page that the theme-price modules share. Nothing here knows a theme's markup.

/** The element and every ancestor above it, nearest first. */
export function listAncestors({ element }) {
  const ancestors = []
  for (let node = element; node; node = node.parentElement) ancestors.push(node)
  return ancestors
}

export function isBelowBody(element) {
  return element !== element.ownerDocument.body && element.ownerDocument.body.contains(element)
}

export function hasDescendant(element, ancestor) {
  return ancestor.contains(element)
}

/** The element is drawn: neither it nor an ancestor has `display: none`, and it is not `visibility: hidden`. A theme can print the same text twice and hide one copy. */
export function isDisplayed(element) {
  const style = element.ownerDocument.defaultView.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

export function isVisible({ element, tools }) {
  return tools.listAncestors({ element }).every(tools.isDisplayed)
}

export const PAGE_ELEMENT_TOOLS = { listAncestors, isBelowBody, hasDescendant, isDisplayed, isVisible }
