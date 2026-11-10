// Which components the pop-up needs, and loading them. The embed hands over the address of each in data-component-urls
// (blocks/bundle-popup.liquid); the list of names is decided here from what the customer sees.

export function loadPopupComponent({ win, urls, loadComponent }, name) {
  return loadComponent({ root: win, document: win.document, name, url: urls[name] })
}

/** The loaded components by name: the boxes, the UI (controller), its drawing and its arithmetic, plus the currency component only for a customer who sees another currency than the shop's. Rejects when one cannot be loaded, and the press then goes ahead. */
export function loadPopupComponents({ win, config, tools }) {
  const names = config.isForeignCurrency ? ['popupBoxes', 'popupUi', 'popupView', 'popupFacts', 'currency'] : ['popupBoxes', 'popupUi', 'popupView', 'popupFacts']
  const loadOne = tools.loadPopupComponent.bind(null, { win, urls: config.componentUrls, loadComponent: tools.loadComponent })
  return tools.loadComponentSet({ names, loadOne })
}
