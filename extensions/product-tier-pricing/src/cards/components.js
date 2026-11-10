// Which components the card script needs, and loading them. The embed hands over the address of each in data-component-urls
// (blocks/card-prices.liquid); the list of names is decided here from what the customer sees.

/** The offer component every page with the embed needs, plus the currency component only for a customer who sees another currency than the shop's. */
export function listCardComponents({ isForeignCurrency }) {
  return isForeignCurrency ? ['cardOffer', 'currency'] : ['cardOffer']
}

export function loadCardComponent({ win, urls, loadComponent }, name) {
  return loadComponent({ root: win, document: win.document, name, url: urls[name] })
}

/** The loaded components by name, or null when one cannot be loaded: the cards then keep their plain price and the page does not break. */
export function loadCardComponents({ win, config, tools }) {
  const names = tools.listCardComponents({ isForeignCurrency: config.isForeignCurrency })
  const loadOne = tools.loadCardComponent.bind(null, { win, urls: config.componentUrls, loadComponent: tools.loadComponent })
  return tools.loadComponentSet({ names, loadOne }).catch(() => null)
}

export const COMPONENT_TOOLS = { listCardComponents, loadCardComponent, loadCardComponents }
