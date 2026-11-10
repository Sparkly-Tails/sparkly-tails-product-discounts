// The products a customer can add to complete a bundle, and the units Quick auto-fill chooses. Pure: the live product
// data (from /products/{handle}.js) and the cart lines come in as arguments, the functions it calls as `tools`.

/** True when the variant is one the member offers: every variant of a member without listed variants, else only the listed ones. */
export function isMemberVariant({ member }, variant) {
  return member.variantIds === null || member.variantIds.includes(String(variant.id))
}

export function isImageText(value) {
  return typeof value === 'string' && value !== ''
}

/** The variant's own picture, else the product's, else null. */
export function readImageUrl({ product, variant }) {
  const found = [Object(variant.featured_image).src, product.featured_image].find(isImageText)
  return found === undefined ? null : found
}

/** "Product – Variant", or just the product when it has one variant. */
export function buildItemLabel({ product, variant }) {
  return product.variants.length > 1 ? product.title + ' – ' + variant.title : product.title
}

/** One variant as an item. `price` is in currency units (the live data has cents). */
export function buildItem({ member, product, tools }, variant) {
  return {
    variantId: String(variant.id),
    productId: member.productId,
    handle: member.handle,
    label: tools.buildItemLabel({ product, variant }),
    imageUrl: tools.readImageUrl({ product, variant }),
    price: variant.price / 100,
    available: variant.available === true,
  }
}

/** The items of one member: none when its product's data is missing or unreadable. */
export function listMemberItems({ products, tools }, member) {
  const product = products.get(member.handle)
  return product && Array.isArray(product.variants) ? product.variants.filter(tools.isMemberVariant.bind(null, { member })).map(tools.buildItem.bind(null, { member, product, tools })) : []
}

/** The items of a bundle, in member order then variant order. `products` maps a handle to its live product data. Unavailable items are kept, marked. */
export function listEligibleItems({ products, members, tools }) {
  return members.flatMap(tools.listMemberItems.bind(null, { products, tools }))
}

export function isItemAvailable(item) {
  return item.available
}

/** True when at least one item can be added. */
export function isCompletable({ items }) {
  return items.some(isItemAvailable)
}

export function readLineVariantId(line) {
  return String(line.variant_id)
}

export function hasVariantId({ variantId }, item) {
  return item.variantId === variantId
}

export function findItemOfVariant({ items }, variantId) {
  return items.find(hasVariantId.bind(null, { variantId }))
}

export function isDefined(value) {
  return value !== undefined
}

/** The available items in the order Quick auto-fill goes through them: the ones already in the cart (in cart order, once each), then the rest in list order. */
export function orderQuickFillItems({ items, lines, tools }) {
  const available = items.filter(tools.isItemAvailable)
  const cartIds = Array.from(new Set(lines.map(tools.readLineVariantId)))
  const inCart = cartIds.map(tools.findItemOfVariant.bind(null, { items: available })).filter(tools.isDefined)
  return inCart.concat(available.filter(tools.isNotIn.bind(null, { items: inCart })))
}

export function isNotIn({ items }, item) {
  return !items.includes(item)
}

/** The units one item takes in `missing` units dealt out one per item per pass: `base` each, and one more for the first `extra` items of `order`. */
export function buildPick({ order, base, extra }, item) {
  return { variantId: item.variantId, quantity: base + (order.indexOf(item) < extra ? 1 : 0) }
}

export function hasQuantity(pick) {
  return pick.quantity > 0
}

/** The units to add to reach `missing`: `[{ variantId, quantity }]`, empty when nothing is missing or nothing is available. */
export function chooseQuickFill({ items, lines, missing, tools }) {
  const order = tools.orderQuickFillItems({ items, lines, tools })
  if (missing <= 0 || order.length === 0) return []
  const base = Math.floor(missing / order.length)
  const extra = missing % order.length
  return order.map(tools.buildPick.bind(null, { order, base, extra })).filter(tools.hasQuantity)
}

export function readItemPrice({ items, variantId, tools }) {
  const found = tools.findItemOfVariant({ items }, variantId)
  return found ? found.price : 0
}

export function buildPickCost({ items, tools }, pick) {
  return pick.quantity * tools.readItemPrice({ items, variantId: pick.variantId, tools })
}

export function addAmount(total, amount) {
  return total + amount
}

/** What the picks cost together in the customer's currency, to the cent. */
export function sumQuickFillCost({ picks, items, tools }) {
  return Math.round(picks.map(tools.buildPickCost.bind(null, { items, tools })).reduce(tools.addAmount, 0) * 100) / 100
}

export const ITEM_TOOLS = {
  isMemberVariant, readImageUrl, buildItemLabel, buildItem, listMemberItems, listEligibleItems, isItemAvailable, isCompletable, readLineVariantId, findItemOfVariant,
  hasVariantId, isDefined, isNotIn, orderQuickFillItems, buildPick, hasQuantity, chooseQuickFill, readItemPrice, buildPickCost, addAmount, sumQuickFillCost,
}
