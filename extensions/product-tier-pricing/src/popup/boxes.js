// The boxes component: from the bundles that are due to the boxes the pop-up shows. It fetches the live products of the due
// bundles, puts the tiers in the customer's currency and lists the items that can be added. The core script loads it only when a
// bundle is due. Pure of the page's own state: the window, the config and the functions come in as arguments.
import { convertDiscount, isShownUsable, readShownDiscount, showIndexInCurrency } from '../cards/entries.js'
import { parseText } from '../config.js'
import { readAccents } from './config.js'
import { fetchJson, returnNothing } from './fetch.js'
import { LIST_TOOLS } from './items.js'
import { buildRootPath } from './path.js'

export function readMemberHandle(member) {
  return member.handle
}

export function readEntryHandles(entry) {
  return entry.discount.members.map(readMemberHandle)
}

/** The handles of the products of the due bundles, each once. */
export function listProductHandles({ due }) {
  return Array.from(new Set(due.flatMap(readEntryHandles)))
}

export function buildHandlePair({ handle }, product) {
  return [handle, product]
}

/** `[handle, product]` of a product's live data, or null when it cannot be read: that product is then left out of the list. */
export function loadProduct({ win, rootUrl, tools }, handle) {
  const path = tools.buildRootPath({ rootUrl, path: 'products/' + handle + '.js' })
  return tools.fetchJson({ win, path }).then(tools.buildHandlePair.bind(null, { handle })).catch(tools.returnNothing)
}

export function isLoaded(pair) {
  return pair !== null
}

/** The live products by handle (a Map); a product that could not be read is missing from it. */
export async function loadProducts({ win, rootUrl, handles, tools }) {
  const pairs = await Promise.all(handles.map(tools.loadProduct.bind(null, { win, rootUrl, tools })))
  return new Map(pairs.filter(isLoaded))
}

/** The entry with its discount's tiers in the customer's currency (see showIndexInCurrency), and whether that could be done. */
export function showEntryInCurrency({ currency, config, tools }, entry) {
  const shown = tools.showIndexInCurrency({ index: { discounts: [entry.discount] }, currency, rateText: config.rateText, moneySample: config.moneySample, moneyFormat: config.moneyFormat, tools })
  return { ...entry, discount: shown.index.discounts[0], isUsable: shown.isUsable, moneyFormat: shown.moneyFormat }
}

export function isEntryUsable(entry) {
  return entry.isUsable
}

/** The box of one due bundle as a one-item list, or an empty list when nothing can be added to it. */
export function buildBox({ products, lines, tools }, entry) {
  const discount = entry.discount
  const items = tools.listEligibleItems({ products, members: discount.members, tools })
  const box = {
    title: discount.title, tiers: discount.tiers, units: entry.units, firstTierQty: entry.firstTierQty, items, flash: discount.flash, style: discount.style,
    members: discount.members, basePrice: tools.readSharedPrice({ items, tools }), lines, shownKey: entry.shownKey, popupFrequency: discount.popupFrequency,
  }
  return tools.isCompletable({ items }) ? [box] : []
}

export function listBoxes({ entries, products, lines, tools }) {
  return entries.flatMap(tools.buildBox.bind(null, { products, lines, tools }))
}

/** `{ moneyFormat, boxes }`. `boxes` is empty when no bundle can be completed, and when the currency cannot be worked out (nothing is then shown in a wrong currency). */
export function assembleBoxes({ config, due, lines, products, currency, tools }) {
  const entries = due.map(tools.showEntryInCurrency.bind(null, { currency, config, tools }))
  if (!entries.every(tools.isEntryUsable)) return { moneyFormat: '', boxes: [] }
  return { moneyFormat: entries[0].moneyFormat, boxes: tools.listBoxes({ entries, products, lines, tools }) }
}

/** What the core asks of this component: `{ moneyFormat, boxes, accents }`. `currency` is the currency component, or null for a customer who sees the shop's currency. */
export async function prepareBoxes(tools, { win, config, due, lines, currency }) {
  const handles = tools.listProductHandles({ due })
  const products = await tools.loadProducts({ win, rootUrl: config.rootUrl, handles, tools })
  const prepared = tools.assembleBoxes({ config, due, lines, products, currency, tools })
  return { ...prepared, accents: tools.readAccents({ element: config.element, tools }) }
}

export const BOX_TOOLS = {
  ...LIST_TOOLS, fetchJson, returnNothing, readAccents, parseText, buildRootPath, convertDiscount, isShownUsable, readShownDiscount, showIndexInCurrency,
  listProductHandles, buildHandlePair, loadProduct, loadProducts, showEntryInCurrency, isEntryUsable, buildBox, listBoxes, assembleBoxes,
}
