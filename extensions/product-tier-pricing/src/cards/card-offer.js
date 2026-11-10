// The card offer component (card-prices-offer.js): works out the offer for one card from the product's live prices and
// paints it. The card script (init.js) finds the cards and the prices; this part is loaded beside it, so each stays
// under Shopify's size limit for a script.
import { OFFER_TOOLS, buildCardOffer, buildFromText, buildTagText } from './offer.js'
import { PAINT_TOOLS } from './paint.js'

/**
 * Gives one card its offer. `variants` come from /products/<handle>.js (in the customer's currency), `entry` is the
 * card's product with its discount (the tiers in that currency too). True when the card was painted, false when it
 * gets no offer and keeps its price.
 */
export function paintOffer(tools, { target, variants, entry, nowSeconds, moneyFormat }) {
  const offer = tools.buildCardOffer({ variants, entry, nowSeconds, tools })
  if (offer === null) return false
  tools.paintCard({ target, offer, moneyFormat, tools })
  return true
}

export const CARD_OFFER_TOOLS = { ...OFFER_TOOLS, ...PAINT_TOOLS, buildCardOffer, buildFromText, buildTagText }
