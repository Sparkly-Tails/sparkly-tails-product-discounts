// card-prices-offer.js: the offer of a product card. Loaded by card-prices.js on every page that has the embed.
import { CARD_OFFER_TOOLS, paintOffer } from '../cards/card-offer.js'
import { registerComponent } from '../loader/registry.js'

registerComponent({ root: window, name: 'cardOffer', api: { paintOffer: paintOffer.bind(null, CARD_OFFER_TOOLS) } })
