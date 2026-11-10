// bundle-popup.js: the script of the "Bundle pop-up" app embed. When a customer presses Checkout with a bundle in the cart that
// has not reached its first tier, it shows a pop-up where the missing items can be added. It loads its UI component (and, for a
// customer who sees another currency than the shop's, the widget's currency component) only when a pop-up is due.
import { POPUP_TOOLS, startPopup } from '../popup/core.js'

const start = startPopup.bind(null, { win: window, tools: POPUP_TOOLS })

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start)
} else {
  start()
}
