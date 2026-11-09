// tier-pricing-currency.js: the tier prices in another currency. Loaded only for a customer whose currency is not the shop's.
import { CURRENCY_TOOLS, showInCurrency } from '../currency.js'
import { registerComponent } from '../loader/registry.js'

registerComponent({ root: window, name: 'currency', api: { showInCurrency: showInCurrency.bind(null, CURRENCY_TOOLS) } })
