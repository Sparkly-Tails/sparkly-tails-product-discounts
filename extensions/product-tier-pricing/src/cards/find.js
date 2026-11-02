// Finds product cards on any theme without knowing its markup: a card is the smallest element that holds a link
// to a product and a price. Pure of the page's own state: the elements to look in come in as arguments.

const PRODUCT_LINK_SELECTOR = 'a[href*="/products/"]'
// Places that list products but are not cards: the tier widget's own lists, the header and footer menus, the cart
// and anything in a dialog (cart drawer, quick view). Matching is by name, which most themes follow.
const EXCLUDED_AREA_SELECTOR = '[data-smooth-discounts], header, nav, footer, form[action*="/cart"], [class*="cart" i], [id*="cart" i], cart-drawer, cart-items, [role="dialog"]'
const PRICE_SELECTOR = '[class*="price" i], .money, [data-price]'
// What this script has already painted: the theme price it hid and the price it put in its place, with everything inside them.
const PAINTED_SELECTOR = '[data-smooth-discounts-replaced], .smooth-discounts-card__price'

/** The handle in a product link (`/products/tuna?variant=1` is `tuna`), or null for any other link. */
export function readProductHandle({ href }) {
  const match = /\/products\/([^/?#]+)/.exec(href || '')
  return match ? match[1] : null
}

export function listProductLinks({ root }) {
  return Array.from(root.querySelectorAll(PRODUCT_LINK_SELECTOR))
}

export function isCardLink({ link }) {
  return link.closest(EXCLUDED_AREA_SELECTOR) === null
}

/** The element showing the price inside `node` that has not been painted yet (the first in document order, which is the outermost of nested ones), or undefined. */
export function findPriceElement({ node }) {
  return Array.from(node.querySelectorAll(PRICE_SELECTOR)).find((element) => element.closest(PAINTED_SELECTOR) === null)
}

/** The element and every ancestor above it, nearest first. */
export function listAncestors({ element }) {
  const ancestors = []
  for (let node = element; node; node = node.parentElement) ancestors.push(node)
  return ancestors
}

export function isOtherProductLink({ handle, tools }, link) {
  const other = tools.readProductHandle({ href: link.getAttribute('href') })
  return other !== null && other !== handle
}

/** True when `root` links to a product other than `handle`: it is then a list of cards, not one card. */
export function hasOtherProduct({ root, handle, tools }) {
  return tools.listProductLinks({ root }).some(tools.isOtherProductLink.bind(null, { handle, tools }))
}

export function hasPriceElement(tools, node) {
  return tools.findPriceElement({ node }) !== undefined
}

/** `{ root, priceElement }` of the card a link belongs to, or null when it is not in one card of its own. */
export function findCardParts({ link, handle, tools }) {
  const root = tools.listAncestors({ element: link }).find(tools.hasPriceElement.bind(null, tools))
  if (!root || tools.hasOtherProduct({ root, handle, tools })) return null
  return { root, priceElement: tools.findPriceElement({ node: root }) }
}

/** A discounted product, and not the product page being viewed (its own price is not a card). `handles` is a Set. */
export function isCardHandle({ handle, handles, pageHandle }) {
  return handles.has(handle) && handle !== pageHandle
}

/** The handle of a link that can be a card of a discounted product on this page, or null. */
export function readCardHandle({ link, handles, pageHandle, tools }) {
  const handle = tools.readProductHandle({ href: link.getAttribute('href') })
  return tools.isCardHandle({ handle, handles, pageHandle }) && tools.isCardLink({ link }) ? handle : null
}

/** The card of a link, as a one-item list so a link without a card adds nothing: `[{ handle, root, priceElement }]` or `[]`. */
export function listLinkTargets({ handles, pageHandle, tools }, link) {
  const handle = tools.readCardHandle({ link, handles, pageHandle, tools })
  const parts = handle === null ? null : tools.findCardParts({ link, handle, tools })
  return parts === null ? [] : [{ handle, ...parts }]
}

export function isUnmarkedTarget(isMarked, target) {
  return !isMarked({ root: target.root })
}

/** Adds a target to the map, one per price: a card with an image link and a title link finds its price twice, from two roots. The one whose root holds the other's stays: the whole card, with its image, not just its text. */
export function addOuterTarget(targetsByPrice, target) {
  const kept = targetsByPrice.get(target.priceElement)
  targetsByPrice.set(target.priceElement, kept !== undefined && kept.root.contains(target.root) ? kept : target)
}

/** Every card on the page that is for a discounted product and not yet marked: `[{ handle, root, priceElement }]`, one per card. */
export function listCardTargets({ root, handles, pageHandle, isMarked, tools }) {
  const targets = tools.listProductLinks({ root }).flatMap(tools.listLinkTargets.bind(null, { handles, pageHandle, tools }))
  const targetsByPrice = new Map()
  targets.forEach(tools.addOuterTarget.bind(null, targetsByPrice))
  return Array.from(targetsByPrice.values()).filter(tools.isUnmarkedTarget.bind(null, isMarked))
}

export const FIND_TOOLS = {
  readProductHandle, listProductLinks, isCardLink, findPriceElement, listAncestors, isOtherProductLink, hasOtherProduct, hasPriceElement, findCardParts,
  isCardHandle, readCardHandle, listLinkTargets, isUnmarkedTarget, addOuterTarget, listCardTargets,
}
