// The rows of a box's list of eligible items, and what the customer already has of them. No DOM, nothing outside the arguments;
// the functions it calls come in as `tools`. `lines` are the cart lines (from /cart.js), `tier` the box's first tier.

export function isLineOfVariant({ variantId }, line) {
  return String(line.variant_id) === variantId
}

export function addQuantity(total, line) {
  return total + line.quantity
}

/** The units of one variant in the cart lines. */
export function countVariantUnits({ lines, variantId, tools }) {
  return lines.filter(tools.isLineOfVariant.bind(null, { variantId })).reduce(tools.addQuantity, 0)
}

/** "£1.63/ea": what the item costs at the first tier, a fixed price or the item's own price less the tier's percentage. */
export function readItemRate({ tier, formatMoneyText }, item) {
  const rate = tier.fixedPrice != null ? tier.fixedPrice : item.price * (100 - tier.percentOff) / 100
  return formatMoneyText(rate) + '/ea'
}

/** `{ variantId, label, imageUrl, rateText, inCart }` of an item that can be added. */
export function buildRow({ lines, tier, formatMoneyText, tools }, item) {
  const inCart = tools.countVariantUnits({ lines, variantId: item.variantId, tools })
  return { variantId: item.variantId, label: item.label, imageUrl: item.imageUrl, rateText: tools.readItemRate({ tier, formatMoneyText }, item), inCart }
}

/** `{ label, quantity }` of an item with the units of it in the cart. */
export function buildCartEntry({ lines, tools }, item) {
  return { label: item.label, quantity: tools.countVariantUnits({ lines, variantId: item.variantId, tools }) }
}

export function hasUnits(entry) {
  return entry.quantity > 0
}

/** The items of the bundle that are in the cart, with their units. */
export function listCartEntries({ items, lines, tools }) {
  return items.map(tools.buildCartEntry.bind(null, { lines, tools })).filter(tools.hasUnits)
}

export const ROW_TOOLS = { isLineOfVariant, addQuantity, countVariantUnits, readItemRate, buildRow, buildCartEntry, hasUnits, listCartEntries }
