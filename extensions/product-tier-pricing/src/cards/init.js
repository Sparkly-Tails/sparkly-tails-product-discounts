// The product-card script: reads the index the app embed printed, finds the cards of discounted products on the
// page, fetches those products' live prices and has the offer component put the offer on each card. It runs again
// when the page changes (filters, "load more", infinite scroll), and never throws into the page.
import { CURRENCY_READERS, readContainerCurrency } from '../config.js'
import { loadComponentSet, parseComponentUrls } from '../loader/components.js'
import { loadComponent } from '../loader/registry.js'
import { COMPONENT_TOOLS } from './components.js'
import { ENTRY_TOOLS, parseCardIndex } from './entries.js'
import { FIND_TOOLS } from './find.js'
import { isMarked, markCard } from './mark.js'

const SCAN_DELAY_MS = 200

/**
 * What the embed printed: the index, the money format, the shop's root link, the address of each component, and what the
 * page says about currency (see readContainerCurrency). `shopify` is the page's window.Shopify. Null when the embed is not on the page.
 */
export function readCardConfig({ doc, shopify, tools }) {
  const element = doc.querySelector('[data-smooth-discounts-cards]')
  if (!element) return null
  return {
    index: tools.parseCardIndex({ text: element.dataset.index }),
    moneyFormat: tools.parseText({ text: element.dataset.moneyFormat }),
    rootUrl: tools.parseText({ text: element.dataset.rootUrl }),
    componentUrls: tools.parseComponentUrls(element.dataset.componentUrls),
    ...tools.readContainerCurrency({ container: element, shopify, tools: tools.currencyReaders }),
  }
}

/** A JSON text holding one string, as Liquid's json filter prints it; '' when it is not. */
export function parseText({ text }) {
  try {
    const value = JSON.parse(text)
    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  }
}

/** The address of a product's live data. `rootUrl` is the shop's root link: "/" or a language such as "/fr" (no slash after it). */
export function buildProductPath({ rootUrl, handle }) {
  const root = rootUrl.endsWith('/') ? rootUrl : rootUrl + '/'
  return root + 'products/' + handle + '.js'
}

/** The variants in a product's live data (id, price in cents, available), or null when there are none. */
export function readVariants(product) {
  return product && Array.isArray(product.variants) ? product.variants : null
}

/** The live variants of a product, or null when they cannot be read. Asked once per handle, whatever the number of cards. */
export function loadVariants({ win, rootUrl, handle, products, tools }) {
  if (!products.has(handle)) {
    const path = tools.buildProductPath({ rootUrl, handle })
    products.set(handle, win.fetch(path, { headers: { Accept: 'application/json' } }).then((answer) => (answer.ok ? answer.json() : null)).then(tools.readVariants).catch(() => null))
  }
  return products.get(handle)
}

/** One card: its product's live prices, then the offer component's offer and painting. A card that gets no offer is marked so it is not asked again. */
export async function applyCard({ target, entries, context, tools }) {
  const variants = await tools.loadVariants({ win: context.win, rootUrl: context.config.rootUrl, handle: target.handle, products: context.products, tools })
  const nowSeconds = Math.floor(context.win.Date.now() / 1000)
  const isPainted = variants !== null && context.offer.paintOffer({ target, variants, entry: entries.get(target.handle), nowSeconds, moneyFormat: context.config.moneyFormat })
  if (!isPainted) tools.markCard({ root: target.root, state: 'off' })
}

/** Marks a card as being worked on, so the next scan does not start it again, then gives it its offer. */
export function startCard({ entries, context, tools }, target) {
  tools.markCard({ root: target.root, state: 'pending' })
  tools.applyCard({ target, entries, context, tools }).catch(tools.markCard.bind(null, { root: target.root, state: 'off' }))
}

/** Finds the unmarked cards of discounted products now on the page and gives each its offer. */
export function scanCards({ entries, context, tools }) {
  const targets = tools.listCardTargets({
    root: context.win.document,
    handles: new Set(entries.keys()),
    pageHandle: tools.readProductHandle({ href: context.win.location.pathname }),
    isMarked: tools.isMarked,
    tools,
  })
  targets.forEach(tools.startCard.bind(null, { entries, context, tools }))
}

/** Runs `scan` once the page has been quiet for a moment, however many changes came. */
export function scheduleScan({ win, scan, clock }) {
  win.clearTimeout(clock.timer)
  clock.timer = win.setTimeout(scan, SCAN_DELAY_MS)
}

export function watchPage({ win, scan, tools }) {
  const clock = { timer: null }
  const observer = new win.MutationObserver(tools.scheduleScan.bind(null, { win, scan, clock }))
  observer.observe(win.document.body, { childList: true, subtree: true })
}

export const CARD_TOOLS = {
  ...FIND_TOOLS, ...ENTRY_TOOLS, ...COMPONENT_TOOLS,
  parseCardIndex, parseText, parseComponentUrls, readContainerCurrency, currencyReaders: CURRENCY_READERS, loadComponent, loadComponentSet, isMarked, markCard,
  readCardConfig, buildProductPath, readVariants, loadVariants, applyCard, startCard, scanCards, scheduleScan, watchPage, prepareCards, arrangeCards,
}

/** The entries, settings and offer component the cards are painted with; null when the components are missing or the currency cannot be worked out. */
export function arrangeCards({ win, config, components, tools }) {
  if (components === null) return null
  const shown = tools.showIndexInCurrency({ index: config.index, currency: components.currency || null, rateText: config.rateText, moneySample: config.moneySample, moneyFormat: config.moneyFormat, tools })
  if (!shown.isUsable) return null
  return { entries: tools.mapEntriesByHandle({ index: shown.index, tools }), context: { win, config: { ...config, moneyFormat: shown.moneyFormat }, products: new Map(), offer: components.cardOffer } }
}

/** Everything the cards need before one is touched: what to paint with and the components to paint it; null when there is nothing to do. */
export async function prepareCards({ win, tools }) {
  const config = tools.readCardConfig({ doc: win.document, shopify: win.Shopify, tools })
  const entries = config === null ? new Map() : tools.mapEntriesByHandle({ index: config.index, tools })
  if (entries.size === 0) return null
  const components = await tools.loadCardComponents({ win, config, tools })
  return tools.arrangeCards({ win, config, components, tools })
}

/** Starts the card prices on a page: nothing happens when the embed is off, no discount is live, or the currency cannot be worked out. */
export async function startCards({ win, tools }) {
  const setup = await tools.prepareCards({ win, tools })
  if (setup === null) return
  const scan = tools.scanCards.bind(null, { entries: setup.entries, context: setup.context, tools })
  scan()
  tools.watchPage({ win, scan, tools })
}
