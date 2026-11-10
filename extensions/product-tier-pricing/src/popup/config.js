// What the "Bundle pop-up" embed printed (blocks/bundle-popup.liquid), read once when the page is ready.
import { CURRENCY_READERS, parseText, readContainerCurrency } from '../config.js'
import { parseComponentUrls } from '../loader/components.js'
import { parseCardIndex } from '../cards/entries.js'

/**
 * The index, the money format, the shop's root link, the address of each component, the colours, and what the page says
 * about currency (see readContainerCurrency). `element` is the embed's own element: the colours are read from it only when a pop-up is shown.
 * `shopify` is the page's window.Shopify. Null when the embed is not on the page.
 */
export function readPopupConfig({ doc, shopify, tools }) {
  const element = doc.querySelector('[data-smooth-discounts-popup]')
  if (!element) return null
  return {
    index: tools.parseCardIndex({ text: element.dataset.index }),
    moneyFormat: tools.parseText(element.dataset.moneyFormat),
    rootUrl: tools.parseText(element.dataset.rootUrl),
    componentUrls: tools.parseComponentUrls(element.dataset.componentUrls),
    element,
    ...tools.readContainerCurrency({ container: element, shopify, tools: tools.currencyReaders }),
  }
}

export const CONFIG_TOOLS = { readPopupConfig, parseText, parseCardIndex, parseComponentUrls, readContainerCurrency, currencyReaders: CURRENCY_READERS }

/** The three colour settings of the embed, as the widget block has them: the accents and the fallback for a box's own background. */
export function readAccents({ element, tools }) {
  return {
    moss: tools.parseText(element.dataset.mossColor),
    cream: tools.parseText(element.dataset.creamColor),
    sun: tools.parseText(element.dataset.sunColor),
  }
}
