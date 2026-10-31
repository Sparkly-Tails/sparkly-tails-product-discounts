// tier-pricing-time-sale.js: a running time-based discount in the price row. Loaded only for a product that has one.
import { registerComponent } from '../loader/registry.js'
import { updateTimeDiscountDisplay, wireTimeDiscountBoundaries } from '../timeSale.js'

registerComponent({ root: window, name: 'timeSale', api: { updateTimeDiscountDisplay, wireTimeDiscountBoundaries } })
