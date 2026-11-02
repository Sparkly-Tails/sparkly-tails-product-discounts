// The product-card script: reads the index the app embed printed, finds the cards of discounted products on the
// page, fetches those products' live prices and puts the offer on each card. It runs again when the page changes
// (filters, "load more", infinite scroll), and never throws into the page.
import { FIND_TOOLS } from './find.js'
import { OFFER_TOOLS, buildCardOffer, buildFromText, buildTagText, parseCardIndex } from './offer.js'
import { PAINT_TOOLS } from './paint.js'

const SCAN_DELAY_MS = 200

/** What the embed printed: the index, the money format and the shop's root link. Null when the embed is not on the page. */
export function readCardConfig({ doc, tools }) {
  const element = doc.querySelector('[data-smooth-discounts-cards]')
  if (!element) return null
  return {
    index: tools.parseCardIndex({ text: element.dataset.index }),
    moneyFormat: tools.parseText({ text: element.dataset.moneyFormat }),
    rootUrl: tools.parseText({ text: element.dataset.rootUrl }),
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

/** The handle of the product page being viewed (`/en/products/tuna` is `tuna`), or null on any other page. */
export function readPageHandle({ pathname, tools }) {
  return tools.readProductHandle({ href: pathname })
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

export function readJson(answer) {
  return answer.ok ? answer.json() : null
}

/** The live variants of a product, or null when they cannot be read. Asked once per handle, whatever the number of cards. */
export function loadVariants({ win, rootUrl, handle, products, tools }) {
  if (!products.has(handle)) {
    const path = tools.buildProductPath({ rootUrl, handle })
    products.set(handle, win.fetch(path, { headers: { Accept: 'application/json' } }).then(tools.readJson).then(tools.readVariants).catch(tools.readNothing))
  }
  return products.get(handle)
}

export function readNothing() {
  return null
}

/** One card: its product's live prices, the offer, the painting. A card that gets no offer is marked so it is not asked again. */
export async function applyCard({ target, entries, context, tools }) {
  const variants = await tools.loadVariants({ win: context.win, rootUrl: context.config.rootUrl, handle: target.handle, products: context.products, tools })
  const offer = variants === null ? null : tools.buildCardOffer({ variants, entry: entries.get(target.handle), nowSeconds: Math.floor(context.win.Date.now() / 1000), tools })
  if (offer === null) return tools.markCardOff(target.root)
  tools.paintCard({ target, offer, moneyFormat: context.config.moneyFormat, tools })
}

/** Marks a card as being worked on, so the next scan does not start it again, then gives it its offer. */
export function startCard({ entries, context, tools }, target) {
  tools.markCard({ root: target.root, state: 'pending' })
  tools.applyCard({ target, entries, context, tools }).catch(tools.markCardOff.bind(null, target.root))
}

/** Finds the unmarked cards of discounted products now on the page and gives each its offer. */
export function scanCards({ entries, context, tools }) {
  const targets = tools.listCardTargets({
    root: context.win.document,
    handles: new Set(entries.keys()),
    pageHandle: tools.readPageHandle({ pathname: context.win.location.pathname, tools }),
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
  ...OFFER_TOOLS, ...FIND_TOOLS, ...PAINT_TOOLS,
  parseCardIndex, parseText, readCardConfig, readPageHandle, buildProductPath, readVariants, readJson, readNothing, loadVariants, applyCard, startCard, scanCards, scheduleScan, watchPage,
  buildCardOffer, buildFromText, buildTagText,
}

/** Starts the card prices on a page: nothing happens when the embed is off or no discount is live. */
export function startCards({ win, tools }) {
  const config = tools.readCardConfig({ doc: win.document, tools })
  const entries = config === null ? new Map() : tools.mapEntriesByHandle({ index: config.index, tools })
  if (entries.size === 0) return
  const context = { win, config, products: new Map() }
  const scan = tools.scanCards.bind(null, { entries, context, tools })
  scan()
  tools.watchPage({ win, scan, tools })
}
