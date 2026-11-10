// How many units of a bundle are in the cart. Pure: the cart lines (from /cart.js) and the index's members come in as arguments.

/** True when the cart line is of the member's product and, for a member that lists variants, of one of them. A member with `variantIds: null` takes every variant. */
export function isMemberLine({ line }, member) {
  return String(line.product_id) === member.productId && (member.variantIds === null || member.variantIds.includes(String(line.variant_id)))
}

export function isBundleLine({ members, tools }, line) {
  return members.some(tools.isMemberLine.bind(null, { line }))
}

export function addQuantity(total, line) {
  return total + line.quantity
}

/** The units in the cart that belong to the bundle: the lines of its members, a member with listed variants counting those variants only. */
export function countBundleUnits({ lines, members, tools }) {
  return lines.filter(tools.isBundleLine.bind(null, { members, tools })).reduce(tools.addQuantity, 0)
}

export const UNIT_TOOLS = { isMemberLine, isBundleLine, addQuantity, countBundleUnits }
