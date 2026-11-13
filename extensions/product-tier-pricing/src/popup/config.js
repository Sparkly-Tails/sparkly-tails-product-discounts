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
    frequency: tools.parseText(element.dataset.frequency),
    rootUrl: tools.parseText(element.dataset.rootUrl),
    componentUrls: tools.parseComponentUrls(element.dataset.componentUrls),
    element,
    ...tools.readContainerCurrency({ container: element, shopify, tools: tools.currencyReaders }),
  }
}

export const CONFIG_TOOLS = { readPopupConfig, parseText, parseCardIndex, parseComponentUrls, readContainerCurrency, currencyReaders: CURRENCY_READERS }

/** The corner radius the embed printed, as a number; null when it is not one. */
export function parseNumber(text) {
  try {
    const value = JSON.parse(text)
    return typeof value === 'number' ? value : null
  } catch {
    return null
  }
}

/** The store-wide look the embed printed (colours as text, the radius as a number). */
export function readAccents({ element, tools }) {
  return {
    moss: tools.parseText(element.dataset.mossColor),
    cream: tools.parseText(element.dataset.creamColor),
    night: tools.parseText(element.dataset.nightColor),
    radius: tools.parseNumber(element.dataset.radius),
  }
}
