// The index the embed printed, and what is done with it before any card is touched: the products by handle, and the tiers
// in the customer's currency. Pure: the functions it needs come in as `tools`.
const EMPTY_INDEX = { discounts: [] }

/** The index the embed printed, or an empty one when it is missing or damaged: a card then keeps its plain price. */
export function parseCardIndex({ text }) {
  try {
    const index = JSON.parse(text)
    return Array.isArray(index.discounts) ? index : EMPTY_INDEX
  } catch {
    return EMPTY_INDEX
  }
}

export function addMemberEntry({ entries, discount }, member) {
  entries.set(member.handle, { ...member, discount })
}

export function addDiscountEntries({ entries, tools }, discount) {
  discount.members.forEach(tools.addMemberEntry.bind(null, { entries, discount }))
}

/** Every product of every discount, by its handle: `{ handle, productId, variantIds, discount }`. */
export function mapEntriesByHandle({ index, tools }) {
  const entries = new Map()
  index.discounts.forEach(tools.addDiscountEntries.bind(null, { entries, tools }))
  return entries
}

/** One discount with its fixed and anchor prices in the customer's currency: `{ isUsable, moneyFormat, discount }`. */
export function convertDiscount({ currency, rateText, moneySample }, discount) {
  const shown = currency.showInCurrency({ tiers: discount.tiers, rateText, moneySample })
  return { isUsable: shown.isUsable, moneyFormat: shown.moneyFormat, discount: { ...discount, tiers: shown.tiers } }
}

export function isShownUsable(shown) {
  return shown.isUsable
}

export function readShownDiscount(shown) {
  return shown.discount
}

/**
 * The index and money format the cards are painted with: as printed for a customer who sees the shop's currency (`currency`
 * is null), otherwise with every discount's tiers in the customer's currency and the money format of the theme's own
 * `money` filter there. Not usable when the rate or the sample cannot be read: the cards then keep their plain price.
 */
export function showIndexInCurrency({ index, currency, rateText, moneySample, moneyFormat, tools }) {
  if (currency === null) return { isUsable: true, index, moneyFormat }
  const shown = index.discounts.map(tools.convertDiscount.bind(null, { currency, rateText, moneySample }))
  return { isUsable: shown.every(tools.isShownUsable), index: { ...index, discounts: shown.map(tools.readShownDiscount) }, moneyFormat: shown.length > 0 ? shown[0].moneyFormat : moneyFormat }
}

export const ENTRY_TOOLS = { addMemberEntry, addDiscountEntries, mapEntriesByHandle, convertDiscount, isShownUsable, readShownDiscount, showIndexInCurrency }
