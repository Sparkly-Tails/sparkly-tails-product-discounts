// tier-pricing.js: the script the block loads. It finds the widgets on the page, loads the components they
// need (model, paint, and the flash sale, the time-based sale and the siblings list when a page has them)
// and keeps each widget up to date.
import { initTierPricing } from '../core/init.js'

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTierPricing)
} else {
  initTierPricing()
}
