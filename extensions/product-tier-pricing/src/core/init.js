// Finds every widget on the page and starts it.
import { parseWidgetConfig, queryWidgetElements } from '../config.js'
import { isTimeSaleData, listNeededComponents, loadComponentSet, parseComponentUrls } from '../loader/components.js'
import { loadComponent } from '../loader/registry.js'
import { createRenderer } from './renderer.js'
import { wireAddToCartForm, wireCartAwarePolling, wireLoopSubscriptionsPricePoll, wireQuantityStepper, wireVariantChange } from './wiring.js'

// Starts loading what this widget needs. `components` resolves with the loaded components, or with null when
// one cannot be loaded: the widget then keeps the plain price the block rendered and the page does not break.
function startLoadingComponents(container, config) {
  const urls = parseComponentUrls(container.dataset.componentUrls)
  const names = listNeededComponents({ hasFlash: !!config.flash, hasTimeSale: isTimeSaleData(container.dataset.timeDiscount) })
  const loadOne = (name) => loadComponent({ root: window, document, name, url: urls[name] })
  return {
    components: loadComponentSet({ names, loadOne }).catch(() => null),
    loadSiblings: () => loadOne('siblings'),
  }
}

export function initTierPricing() {
  document.querySelectorAll('[data-sparkly-tier-pricing]').forEach((container) => {
    const config = parseWidgetConfig(container)
    const elements = queryWidgetElements(container)
    const loading = startLoadingComponents(container, config)
    const render = createRenderer(container, config, elements, loading)

    render()

    wireQuantityStepper(render)
    wireAddToCartForm(render)
    wireVariantChange(container, render)
    wireLoopSubscriptionsPricePoll(container, render)
    if (config.hasTiers) wireCartAwarePolling(render)
    loading.components.then((parts) => {
      if (parts && parts.timeSale) parts.timeSale.wireTimeDiscountBoundaries(container, render)
    })
  })
}
