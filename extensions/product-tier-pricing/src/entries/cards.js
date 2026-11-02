// card-prices.js: the script of the "Product card prices" app embed. It puts the discount on product cards (collection
// pages, search, related products) once the page is ready.
import { CARD_TOOLS, startCards } from '../cards/init.js'

const start = startCards.bind(null, { win: window, tools: CARD_TOOLS })

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start)
} else {
  start()
}
