// What a product card shows: the lowest unit price the product's discount reaches, worked out from the product's
// live prices (the index only holds the tiers). Pure: no page, no clock; the functions it needs come in as `tools`.
import { flashPhase } from '../flash.js'
import { formatMoney, sortTiersByMinQty, unitPriceAtTier } from '../tierMath.js'

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

export function buildEntry(discount, member) {
  return { handle: member.handle, productId: member.productId, variantIds: member.variantIds, discount }
}

export function listDiscountEntries(tools, discount) {
  return discount.members.map(tools.buildEntry.bind(null, discount))
}

export function listEntryPair(entry) {
  return [entry.handle, entry]
}

/** Every product of every discount, by its handle: `{ handle, productId, variantIds, discount }`. */
export function mapEntriesByHandle({ index, tools }) {
  const entries = index.discounts.flatMap(tools.listDiscountEntries.bind(null, tools))
  return new Map(entries.map(tools.listEntryPair))
}

/** A flash sale shows only while it runs; a regular discount (no window) always does. */
export function isDiscountRunning({ flash, nowSeconds, tools }) {
  return flash === null || tools.flashPhase({ nowSeconds, startsAtUnix: flash.startsAtUnix, endsAtUnix: flash.endsAtUnix }) === 'running'
}

/** A variant a card can offer: in stock, and in the discount (variantIds null = the whole product). */
export function isEligibleVariant(variantIds, variant) {
  return variant.available && (variantIds === null || variantIds.includes(String(variant.id)))
}

export function listEligibleVariants({ variants, variantIds, tools }) {
  return variants.filter(tools.isEligibleVariant.bind(null, variantIds))
}

/** The highest tier, the one a card advertises; null when there are no tiers. */
export function pickTopTier({ tiers, tools }) {
  const sorted = tools.sortTiersByMinQty(tiers)
  return sorted.length > 0 ? sorted[sorted.length - 1] : null
}

/** Shopify gives a variant's price in cents. */
export function readUnitPrice(variant) {
  return variant.price / 100
}

/** The unit price of each variant a card can offer (Shopify gives cents), or none when the discount is not running. */
export function listCardPrices({ variants, entry, nowSeconds, tools }) {
  if (!tools.isDiscountRunning({ flash: entry.discount.flash, nowSeconds, tools })) return []
  return tools.listEligibleVariants({ variants, variantIds: entry.variantIds, tools }).map(readUnitPrice)
}

/** The variant with the lowest price at the top tier: `{ basePrice, salePrice, quantity }`; null without a tier or a price. */
export function pickCheapestOffer({ prices, tier, tools }) {
  if (tier === null || prices.length === 0) return null
  const offers = prices.map(tools.buildOffer.bind(null, { tier, tools }))
  return offers.reduce(tools.keepLowerOffer)
}

export function buildOffer({ tier, tools }, basePrice) {
  return { basePrice, salePrice: tools.unitPriceAtTier(basePrice, tier), quantity: tier.minQty }
}

export function keepLowerOffer(best, offer) {
  return offer.salePrice < best.salePrice ? offer : best
}

/** An offer that saves nothing is no offer: the card keeps its plain price. */
export function keepSavingOffer({ offer }) {
  return offer !== null && offer.salePrice < offer.basePrice ? offer : null
}

export const OFFER_TOOLS = {
  flashPhase, sortTiersByMinQty, unitPriceAtTier, formatMoney,
  isDiscountRunning, isEligibleVariant, listEligibleVariants, pickTopTier, listCardPrices, pickCheapestOffer, buildOffer, keepLowerOffer, keepSavingOffer,
  buildEntry, listDiscountEntries, listEntryPair, mapEntriesByHandle,
}

/** `{ basePrice, salePrice, quantity }` for a card, or null when it should keep its price. `variants` come from /products/<handle>.js. */
export function buildCardOffer({ variants, entry, nowSeconds, tools }) {
  const tier = tools.pickTopTier({ tiers: entry.discount.tiers, tools })
  const prices = tools.listCardPrices({ variants, entry, nowSeconds, tools })
  return tools.keepSavingOffer({ offer: tools.pickCheapestOffer({ prices, tier, tools }) })
}

export function buildFromText({ offer, moneyFormat, tools }) {
  return 'From ' + tools.formatMoney(offer.salePrice, moneyFormat)
}

export function buildTagText({ offer, moneyFormat, tools }) {
  return 'Buy ' + offer.quantity + '+ for ' + tools.formatMoney(offer.salePrice, moneyFormat)
}
