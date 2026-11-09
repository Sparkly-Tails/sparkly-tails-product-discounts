// Finds every widget on the page and starts it.
import { CURRENCY_READERS, parseWidgetConfig, queryWidgetElements, readContainerCurrency } from '../config.js'
import { listNeededComponents, loadComponentSet, parseComponentUrls } from '../loader/components.js'
import { loadComponent } from '../loader/registry.js'
import { createRenderer } from './renderer.js'
import { extractNumericId } from '../tierMath.js'
import { readSelectedVariantId, syncSelectedVariant, wireAddToCartForm, wireCartAwarePolling, wireLoopSubscriptionsPricePoll, wireQuantityStepper, wireSelectedVariantField, wireVariantChange } from './wiring.js'

// Starts loading what this widget needs. `components` resolves with the loaded components, or with null when
// one cannot be loaded: the widget then keeps the plain price the block rendered and the page does not break.
function startLoadingComponents(container, config) {
  const urls = parseComponentUrls(container.dataset.componentUrls)
  const names = listNeededComponents({ hasFlash: !!config.flash, isForeignCurrency: config.isForeignCurrency })
  const loadOne = (name) => loadComponent({ root: window, document, name, url: urls[name] })
  return {
    components: loadComponentSet({ names, loadOne }).catch(() => null),
    loadSiblings: () => loadOne('siblings'),
  }
}

export function initTierPricing() {
  document.querySelectorAll('[data-smooth-discounts]').forEach((container) => {
    const config = { ...parseWidgetConfig(container), ...readContainerCurrency({ container, shopify: window.Shopify, tools: CURRENCY_READERS }) }
    const elements = queryWidgetElements(container)
    const loading = startLoadingComponents(container, config)
    const render = createRenderer(container, config, elements, loading)

    render()

    wireQuantityStepper(render)
    wireAddToCartForm(render)
    wireVariantChange(container, render)
    wireSelectedVariantField({
      root: document,
      soldOutVariantIds: config.soldOutVariantIds,
      variantStateRef: render.variantStateRef,
      render,
      tools: { extractNumericId, readSelectedVariantId, syncSelectedVariant, startTimer: (callback, milliseconds) => window.setInterval(callback, milliseconds) },
    })
    wireLoopSubscriptionsPricePoll(container, render)
    if (config.hasTiers) wireCartAwarePolling(render)
  })
}
