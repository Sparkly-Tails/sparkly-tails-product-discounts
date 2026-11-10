// card-prices.js: the script of the "Product card prices" app embed. It puts the discount on product cards (collection
// pages, search, related products) once the page is ready. It loads its offer component (and, for a customer who sees
// another currency than the shop's, the widget's currency component) before it touches a card.
import { CARD_TOOLS, startCards } from '../cards/init.js'

// A failure here must never reach the page: the cards simply keep their price.
const start = () => startCards({ win: window, tools: CARD_TOOLS }).catch(() => {})

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start)
} else {
  start()
}
