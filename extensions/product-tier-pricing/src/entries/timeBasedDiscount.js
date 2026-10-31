// time-based-discount.js: the countdown widget of the time-based discount block.
import { initTimeDiscountWidget } from '../timeBasedDiscountDom.js'

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTimeDiscountWidget)
} else {
  initTimeDiscountWidget()
}
